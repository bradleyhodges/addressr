"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchForAddress = exports.setAddresses = exports.mapToJsonApiAutocompleteResponse = exports.mapToSearchAddressResponse = exports.getAddresses = exports.getAddress = exports.gotClient = exports.keepAliveAgent = exports.gnafHttpCache = exports.cache = exports.error = exports.logger = exports.readdir = exports.fsp = void 0;
const crypto = require("node:crypto");
const fs = require("node:fs");
const node_https_1 = require("node:https");
const debug_1 = require("debug");
const got = require("got");
const LinkHeader = require("http-link-header");
const Keyv = require("keyv");
const keyv_file_1 = require("keyv-file");
const load_1 = require("./commands/load");
const conf_1 = require("./conf");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const setLinkOptions_1 = require("./setLinkOptions");
/**
 * Make the file system promises available globally.
 */
exports.fsp = fs.promises;
exports.readdir = exports.fsp.readdir;
/**
 * Loggers for the API.
 */
exports.logger = (0, debug_1.default)("api");
exports.error = (0, debug_1.default)("error");
/**
 * The cache for the API.
 */
exports.cache = new Keyv({
    store: new keyv_file_1.KeyvFile({ filename: "target/keyv-file.msgpack" }),
});
/**
 * Persistent HTTP cache for Got requests to avoid re-downloading unchanged payloads.
 */
exports.gnafHttpCache = new Keyv({
    store: new keyv_file_1.KeyvFile({ filename: "target/gnaf-http-cache.msgpack" }),
    namespace: "gnaf-http-cache",
});
/**
 * Shared keep-alive HTTPS agent to reuse sockets across fetches.
 */
exports.keepAliveAgent = new node_https_1.Agent({
    keepAlive: true,
    maxSockets: 10,
});
/**
 * Got client configured for persistent HTTP cache reuse and keep-alive sockets.
 */
exports.gotClient = got.extend({
    cache: exports.gnafHttpCache,
    agent: { http: exports.keepAliveAgent, https: exports.keepAliveAgent },
});
// ---------------------------------------------------------------------------------
/**
 * Sets the addresses in the index.
 *
 * @param addr - The addresses to set.
 */
const setAddresses = async (addr) => {
    // Clear the addresses index
    await (0, helpers_1.clearAddresses)();
    // Create the indexing body
    const indexingBody = [];
    // Loop through the addresses and build index operations
    for (const row of addr) {
        // Add the index operation header
        indexingBody.push({
            index: {
                _index: conf_1.ES_INDEX_NAME,
                _id: row.links.self.href,
            },
        });
        // Destructure address components for the document body
        const { sla, ssla, ...structured } = row;
        // Extract confidence from nested structure or top-level (backwards compatible)
        const confidence = structured.structured?.confidence ?? structured.confidence;
        // Add the address document body
        indexingBody.push({
            sla,
            ssla,
            structured,
            ...(confidence !== undefined && { confidence }),
        });
    }
    // If there are addresses to index, send the index request
    if (indexingBody.length > 0) {
        // Send the index request
        await (0, load_1.sendIndexRequest)(indexingBody);
    }
};
exports.setAddresses = setAddresses;
/**
 * Validates and normalizes search pagination parameters, coercing unsafe inputs
 * to safe defaults and clamping to avoid deep pagination.
 *
 * @param page - Raw page number (may be undefined, NaN, negative, or too large).
 * @param size - Raw page size (may be undefined, NaN, negative, or too large).
 * @returns Validated and clamped pagination parameters.
 */
const validatePaginationParams = (page, size) => {
    // Coerce to numbers and default when inputs are not finite
    const safePage = Number.isFinite(page) ? page : 1;
    const safeSize = Number.isFinite(size) ? size : conf_1.PAGE_SIZE;
    // Ensure page is at least 1 and at most MAX_PAGE_NUMBER
    const validPage = Math.max(1, Math.min(safePage, conf_1.MAX_PAGE_NUMBER));
    // Ensure size is at least 1 and at most MAX_PAGE_SIZE
    const validSize = Math.max(1, Math.min(safeSize, conf_1.MAX_PAGE_SIZE));
    return { validPage, validSize };
};
/**
 * Normalizes inbound search strings to reduce permutations and block accidental
 * match-all queries caused by blank or whitespace-only input.
 *
 * @param searchString - Raw search string supplied by the caller.
 * @returns Normalized search string (trimmed, single-spaced, or empty string).
 */
const normalizeSearchString = (searchString) => (searchString ?? "").trim().replace(/\s+/g, " ");
/**
 * Searches for an address in the index with fuzzy matching.
 *
 * This function performs a multi-match query against the SLA and SSLA fields
 * with both bool_prefix and phrase_prefix matching for optimal autocomplete behavior.
 * Results are cached using an LRU cache for frequently accessed queries, and
 * operations are protected by a circuit breaker to handle OpenSearch failures gracefully.
 *
 * @augments autoCompleteAddress - This function is part of the autocomplete functionality
 *
 * @param searchString - The search string to match against addresses.
 * @param p - The page number (1-indexed, will be validated and clamped).
 * @param pageSize - The page size (will be validated and clamped to MAX_PAGE_SIZE).
 * @returns A promise resolving to the OpenSearch search response with pagination metadata.
 * @throws {CircuitOpenError} If OpenSearch circuit is open due to repeated failures.
 */
const searchForAddress = async (searchString, p, pageSize = conf_1.PAGE_SIZE) => {
    // Normalize the inbound search string to reduce query permutations
    const normalizedSearch = normalizeSearchString(searchString);
    // Reject empty searches to avoid expensive match-all queries
    if (normalizedSearch === "") {
        throw new Error("Search query must not be empty after normalization");
    }
    // Validate and clamp pagination parameters to prevent abuse
    const { validPage, validSize } = validatePaginationParams(p, pageSize);
    // Generate cache key for this search query
    const cacheKey = (0, helpers_1.generateSearchCacheKey)(normalizedSearch, validPage, validSize);
    // Check cache first if enabled
    if (config_1.CACHE_ENABLED) {
        const cached = (0, helpers_1.getSearchCache)().get(cacheKey);
        if (cached !== undefined) {
            if (config_1.VERBOSE)
                (0, exports.logger)("Cache HIT for search:", normalizedSearch);
            // Return cached result wrapped in expected format
            return {
                searchResponse: {
                    body: {
                        hits: {
                            hits: cached.results,
                            total: { value: cached.totalHits, relation: "eq" },
                        },
                    },
                },
                page: cached.page,
                size: cached.size,
                totalHits: cached.totalHits,
            };
        }
    }
    // Calculate the offset for OpenSearch (0-indexed)
    const from = (validPage - 1) * validSize;
    // Execute search with circuit breaker protection
    const circuit = (0, helpers_1.getOpenSearchCircuit)();
    // Calculate the query length for proximity scoring
    const queryLength = normalizedSearch.length;
    const searchResp = await circuit.execute(async () => {
        // Search the index for the address
        return (await global.esClient.search({
            index: conf_1.ES_INDEX_NAME,
            body: {
                from,
                size: validSize,
                // Limit payload to fields required by the response mapper
                _source: ["sla"],
                query: {
                    // Use function_score to boost addresses that are closer in length to the query.
                    // This ensures "50 St Georges Tce" ranks above "Shop 5, 50 St Georges Tce"
                    // when searching for "50 St Georges Tce"
                    function_score: {
                        query: {
                            bool: {
                                // If the search string is not empty, add the search string to the query using a multi match query to
                                // search against the `sla` and `ssla` fields
                                ...(normalizedSearch && {
                                    should: [
                                        {
                                            multi_match: {
                                                fields: ["sla", "ssla"],
                                                query: normalizedSearch,
                                                // Fuzziness is set to AUTO to allow for typos and variations in the search string
                                                fuzziness: "AUTO",
                                                // Type is set to bool_prefix to allow for partial matching of the search string
                                                type: "bool_prefix",
                                                // Lenient is set to true to allow for partial matching of the search string
                                                lenient: true,
                                                // Auto generate synonyms phrase query is set to false to prevent the generation of synonyms phrase queries
                                                auto_generate_synonyms_phrase_query: false,
                                                operator: "AND",
                                            },
                                        },
                                        {
                                            multi_match: {
                                                fields: ["sla", "ssla"],
                                                query: normalizedSearch,
                                                // Type is set to phrase_prefix to allow for partial matching of the search string
                                                type: "phrase_prefix",
                                                // Lenient is set to true to allow for partial matching of the search string
                                                lenient: true,
                                                // Auto generate synonyms phrase query is set to false to prevent the generation of synonyms phrase queries
                                                auto_generate_synonyms_phrase_query: false,
                                                operator: "AND",
                                            },
                                        },
                                    ],
                                }),
                            },
                        },
                        // Script score to boost addresses with length closer to the query length.
                        // Uses a decay function: the more "extra" characters an address has beyond
                        // the query, the lower the boost. This prioritizes exact-length matches
                        // while still allowing longer addresses to appear in results.
                        script_score: {
                            script: {
                                source: `
                                    // Get the SLA field length, defaulting to a large value if missing
                                    int slaLen = doc['sla.raw'].size() > 0 ? doc['sla.raw'].value.length() : 1000;
                                    // Calculate how much longer the address is compared to the query
                                    int extraChars = Math.max(0, slaLen - params.queryLen);
                                    // Apply a decay factor: addresses with more extra characters get lower scores
                                    // The decay is moderate (0.02 per extra char) to not completely override relevance
                                    // but strong enough to prioritize shorter, closer matches
                                    double proximityBoost = 1.0 / (1.0 + extraChars * 0.02);
                                    // Multiply the original score by the proximity boost
                                    return _score * proximityBoost;
                                `,
                                params: {
                                    queryLen: queryLength,
                                },
                            },
                        },
                        // Ensure we use the modified score from the script
                        boost_mode: "replace",
                    },
                },
                sort: [
                    "_score",
                    { confidence: { order: "desc" } },
                    { "ssla.raw": { order: "asc" } },
                    { "sla.raw": { order: "asc" } },
                ],
            },
        }));
    });
    // Extract the total hit count for pagination calculations
    const rawTotal = searchResp.body.hits.total;
    const totalHits = typeof rawTotal === "number" ? rawTotal : rawTotal.value;
    // Cache the result if caching is enabled
    if (config_1.CACHE_ENABLED) {
        const cacheEntry = {
            results: searchResp.body.hits.hits,
            totalHits: totalHits ?? 0,
            page: validPage,
            size: validSize,
        };
        (0, helpers_1.getSearchCache)().set(cacheKey, cacheEntry);
        if (config_1.VERBOSE)
            (0, exports.logger)("Cache SET for search:", normalizedSearch);
    }
    // Log the hits
    if (config_1.VERBOSE)
        (0, exports.logger)("hits", JSON.stringify(searchResp.body.hits, undefined, 2));
    return {
        searchResponse: searchResp,
        page: validPage,
        size: validSize,
        totalHits: totalHits ?? 0,
    };
};
exports.searchForAddress = searchForAddress;
/**
 * Retrieves detailed information about a specific address by its ID.
 *
 * This function queries OpenSearch for the address document, constructs the
 * response as a JSON:API document with proper links, and generates an ETag hash
 * for caching. Operations are protected by a circuit breaker to handle OpenSearch
 * failures gracefully.
 *
 * @param {string} addressId - The unique identifier for the address (G-NAF PID).
 * @returns {Promise<Types.GetAddressResponse>} A promise resolving to either:
 *   - Success: `{ link, json, hash }` containing the JSON:API document and navigation links
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and JSON:API error document
 */
const getAddress = async (addressId) => {
    try {
        // Get the circuit breaker for OpenSearch operations
        const circuit = (0, helpers_1.getOpenSearchCircuit)();
        // Query OpenSearch for the address document by its canonical path ID
        // Protected by circuit breaker to prevent cascading failures
        const jsonX = await circuit.execute(async () => {
            return await global.esClient.get({
                index: conf_1.ES_INDEX_NAME,
                id: `/addresses/${addressId}`,
            });
        });
        if (config_1.VERBOSE)
            (0, exports.logger)("jsonX", jsonX);
        // Extract the source data from OpenSearch response
        const source = jsonX.body._source;
        // Build the JSON:API address detail attributes
        const attributes = {
            pid: addressId,
            sla: source.sla,
            ...(source.ssla !== undefined && { ssla: source.ssla }),
            ...(source.structured?.mla !== undefined && {
                mla: source.structured.mla,
            }),
            ...(source.structured?.smla !== undefined && {
                smla: source.structured.smla,
            }),
            structured: {
                ...(source.structured?.buildingName !== undefined && {
                    buildingName: source.structured.buildingName,
                }),
                ...(source.structured?.lotNumber !== undefined && {
                    lotNumber: source.structured.lotNumber,
                }),
                ...(source.structured?.flat !== undefined && {
                    flat: source.structured.flat,
                }),
                ...(source.structured?.level !== undefined && {
                    level: source.structured.level,
                }),
                ...(source.structured?.number !== undefined && {
                    number: source.structured.number,
                }),
                ...(source.structured?.street !== undefined && {
                    street: source.structured.street,
                }),
                ...(source.structured?.locality !== undefined && {
                    locality: source.structured.locality,
                }),
                ...(source.structured?.state !== undefined && {
                    state: source.structured.state,
                }),
                ...(source.structured?.postcode !== undefined && {
                    postcode: source.structured.postcode,
                }),
                ...(source.structured?.confidence !== undefined && {
                    confidence: source.structured.confidence,
                }),
            },
            ...(source.structured?.geo !== undefined && {
                geo: source.structured.geo,
            }),
        };
        // Build the JSON:API resource and document
        const resource = (0, helpers_1.buildAddressResource)(addressId, attributes);
        const jsonApiDocument = (0, helpers_1.buildAddressDetailDocument)(resource);
        if (config_1.VERBOSE)
            (0, exports.logger)("jsonApiDocument", jsonApiDocument);
        // Construct HATEOAS self-link for the address resource
        const link = new LinkHeader();
        link.set({
            rel: "self",
            uri: `/addresses/${addressId}`,
        });
        // Use pre-computed hash from document if available, otherwise compute on-the-fly
        // Pre-computed hashes are stored during indexing for better performance
        const precomputedHash = source.documentHash;
        const hash = precomputedHash ??
            crypto
                .createHash("md5")
                .update(JSON.stringify(jsonApiDocument))
                .digest("hex");
        return { link, json: jsonApiDocument, hash };
    }
    catch (error_) {
        // Handle circuit breaker open state (503 - service temporarily unavailable)
        if (error_ instanceof helpers_1.CircuitOpenError) {
            (0, exports.error)("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: helpers_1.ErrorDocuments.serviceUnavailable(retryAfterSeconds),
            };
        }
        // Cast to OpenSearch error type for proper error handling
        const osError = error_;
        (0, exports.error)("error getting record from elastic search", osError);
        // Handle document not found (404)
        if (osError.body?.found === false) {
            return {
                statusCode: 404,
                json: helpers_1.ErrorDocuments.notFound("address", addressId),
            };
        }
        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: helpers_1.ErrorDocuments.serviceUnavailable(),
            };
        }
        // Fallback for unexpected errors (500)
        return {
            statusCode: 500,
            json: helpers_1.ErrorDocuments.internalError(),
        };
    }
};
exports.getAddress = getAddress;
/**
 * Searches for addresses matching a query string with pagination support.
 *
 * This function performs a fuzzy search against the address index, returning
 * minimal autocomplete suggestions in JSON:API format with proper pagination.
 * The response is optimized for fast rendering of autocomplete dropdowns.
 *
 * @param {string} url - The base URL for the addresses endpoint (used for link construction).
 * @param {Types.SwaggerContext} swagger - Swagger/OpenAPI context for API documentation linkage.
 * @param {string} [q] - The search query string for address matching.
 * @param {number} [p=1] - The page number for pagination (1-indexed).
 * @returns {Promise<Types.GetAddressesResponse>} A promise resolving to either:
 *   - Success: `{ link, json, linkTemplate }` containing JSON:API autocomplete results
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and JSON:API error document
 */
const getAddresses = async (url, swagger, q, p = 1) => {
    try {
        // Normalize inbound search to prevent match-all scans on empty input
        const normalizedQuery = normalizeSearchString(q);
        if (normalizedQuery === "") {
            return {
                statusCode: 400,
                json: helpers_1.ErrorDocuments.badRequest("The 'q' query parameter is required and must not be empty.", "q"),
            };
        }
        // Execute the address search query against the index
        const { searchResponse: foundAddresses, page, size, totalHits, } = await searchForAddress(normalizedQuery, p);
        if (config_1.VERBOSE)
            (0, exports.logger)("foundAddresses", foundAddresses);
        // Calculate pagination values
        const totalPages = Math.ceil(totalHits / size);
        // Build JSON:API autocomplete resources from search hits
        const resources = mapToJsonApiAutocompleteResponse(foundAddresses);
        // Build JSON:API pagination links
        const jsonApiLinks = (0, helpers_1.buildPaginationLinks)(url, normalizedQuery, page, totalPages);
        // Add API documentation link
        jsonApiLinks.describedby = {
            href: `/docs/#operations-${swagger.path.get["x-swagger-router-controller"].toLowerCase()}-${swagger.path.get.operationId}`,
            title: `${swagger.path.get.operationId} API Docs`,
            type: "text/html",
        };
        // Build JSON:API pagination metadata
        const meta = (0, helpers_1.buildPaginationMeta)(totalHits, page, size);
        // Build the complete JSON:API document
        const jsonApiDocument = (0, helpers_1.buildAutocompleteDocument)(resources, jsonApiLinks, meta);
        if (config_1.VERBOSE)
            (0, exports.logger)("jsonApiDocument", JSON.stringify(jsonApiDocument, undefined, 2));
        // Initialize the Link header for HATEOAS navigation (kept for backwards compatibility)
        const link = new LinkHeader();
        // Add link to API documentation for this operation
        link.set({
            rel: "describedby",
            uri: `/docs/#operations-${swagger.path.get["x-swagger-router-controller"].toLowerCase()}-${swagger.path.get.operationId}`,
            title: `${swagger.path.get.operationId} API Docs`,
            type: "text/html",
        });
        // Build query string for the current request (self link)
        const sp = new URLSearchParams({
            ...(normalizedQuery !== "" && { q: normalizedQuery }),
            ...(page !== 1 && { "page[number]": String(page) }),
        });
        const spString = sp.toString();
        // Add self-referential link for the current page
        link.set({
            rel: "self",
            uri: `${url}${spString === "" ? "" : "?"}${spString}`,
        });
        // Add link to the first page of results
        link.set({
            rel: "first",
            uri: `${url}${normalizedQuery === "" ? "" : "?"}${new URLSearchParams({
                ...(normalizedQuery !== "" && { q: normalizedQuery }),
            }).toString()}`,
        });
        // Add previous page link if not on the first page
        if (page > 1) {
            link.set({
                rel: "prev",
                uri: `${url}${normalizedQuery === "" && page === 2 ? "" : "?"}${new URLSearchParams({
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                    ...(page > 2 && { "page[number]": String(page - 1) }),
                }).toString()}`,
            });
        }
        if (config_1.VERBOSE)
            (0, exports.logger)("TOTAL", totalHits);
        if (config_1.VERBOSE)
            (0, exports.logger)("PAGE_SIZE * p", size * page);
        // Determine if there are more pages available
        const hasNextPage = totalHits > size * page;
        if (config_1.VERBOSE)
            (0, exports.logger)("next?", hasNextPage);
        // Add next page link if more results exist
        if (hasNextPage) {
            link.set({
                rel: "next",
                uri: `${url}?${new URLSearchParams({
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                    "page[number]": String(page + 1),
                }).toString()}`,
            });
        }
        // Add last page link
        if (totalPages > 0) {
            link.set({
                rel: "last",
                uri: `${url}?${new URLSearchParams({
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                    ...(totalPages > 1 && {
                        "page[number]": String(totalPages),
                    }),
                }).toString()}`,
            });
        }
        // Construct Link-Template header for API discoverability (RFC 6570)
        const linkTemplate = new LinkHeader();
        const op = swagger.path.get;
        (0, setLinkOptions_1.setLinkOptions)(op, url, linkTemplate);
        // Return JSON:API document instead of legacy format
        return {
            link,
            json: jsonApiDocument,
            linkTemplate,
        };
    }
    catch (error_) {
        // Handle circuit breaker open state (503 - service temporarily unavailable)
        if (error_ instanceof helpers_1.CircuitOpenError) {
            (0, exports.error)("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: helpers_1.ErrorDocuments.serviceUnavailable(retryAfterSeconds),
            };
        }
        // Cast to OpenSearch error type for proper error handling
        const osError = error_;
        (0, exports.error)("error querying elastic search", osError);
        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: helpers_1.ErrorDocuments.serviceUnavailable(),
            };
        }
        // Handle OpenSearch request timeout (504)
        if (osError.displayName === "RequestTimeout") {
            return {
                statusCode: 504,
                json: helpers_1.ErrorDocuments.gatewayTimeout(),
            };
        }
        // Fallback for unexpected errors (500)
        return {
            statusCode: 500,
            json: helpers_1.ErrorDocuments.internalError(),
        };
    }
};
exports.getAddresses = getAddresses;
/**
 * Transforms raw OpenSearch search hits into JSON:API autocomplete resources.
 *
 * This function maps the internal OpenSearch document structure to JSON:API
 * resource objects optimized for autocomplete, containing only the essential
 * display text (SLA), relevance rank, and self-link.
 *
 * @param {Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>} foundAddresses -
 *   The raw OpenSearch search response containing hits.
 * @returns {Types.JsonApiResource<Types.AddressAutocompleteAttributes>[]} Array of JSON:API resources.
 */
const mapToJsonApiAutocompleteResponse = (foundAddresses) => {
    // Get the maximum score for normalization (first result typically has highest score)
    const maxScore = foundAddresses.body.hits.hits[0]
        ? foundAddresses.body.hits.hits[0]._score
        : 1;
    // Map each hit to a JSON:API resource, normalizing scores to 0-1 range
    return foundAddresses.body.hits.hits.map((h) => {
        // Cast hit to the expected structure for type-safe access
        const hit = h;
        // Extract the address ID from the document path (remove /addresses/ prefix)
        const addressId = (0, helpers_1.extractAddressId)(hit._id);
        // Normalize score to 0-1 range relative to the best match
        const normalizedRank = maxScore > 0 ? hit._score / maxScore : 0;
        // Build and return the JSON:API autocomplete resource
        return (0, helpers_1.buildAutocompleteResource)(addressId, hit._source.sla, normalizedRank, hit._source.ssla);
    });
};
exports.mapToJsonApiAutocompleteResponse = mapToJsonApiAutocompleteResponse;
/**
 * Transforms raw OpenSearch search hits into the legacy API response format.
 *
 * @deprecated Use mapToJsonApiAutocompleteResponse for JSON:API compliant responses.
 * This function is retained for backwards compatibility during the transition period.
 *
 * @param {Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>} foundAddresses -
 *   The raw OpenSearch search response containing hits.
 * @returns {Types.AddressSearchResult[]} An array of address results formatted for the legacy API.
 */
const mapToSearchAddressResponse = (foundAddresses) => {
    // Map each hit to the API response format, extracting relevant fields
    return foundAddresses.body.hits.hits.map((h) => {
        // Cast hit to the expected structure for type-safe access
        const hit = h;
        return {
            sla: hit._source.sla,
            score: hit._score,
            links: {
                self: {
                    href: hit._id,
                },
            },
        };
    });
};
exports.mapToSearchAddressResponse = mapToSearchAddressResponse;
/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
exports.default = {
    load: load_1.loadCommandEntry,
    autocomplete: getAddresses,
    lookup: getAddress,
};
//# sourceMappingURL=index.js.map