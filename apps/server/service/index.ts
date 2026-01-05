import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import debug from "debug";
import * as got from "got";
import LinkHeader from "http-link-header";
import Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import { loadCommandEntry, sendIndexRequest } from "./commands/load";
import {
    ES_INDEX_NAME,
    ES_LOCALITY_INDEX_NAME,
    MAX_PAGE_NUMBER,
    MAX_PAGE_SIZE,
    PAGE_SIZE,
} from "./conf";
import { CACHE_ENABLED, VERBOSE } from "./config";
import {
    API_WARNINGS,
    type CachedSearchResult,
    CircuitOpenError,
    ErrorDocuments,
    buildAddressDetailDocument,
    buildAddressResource,
    buildAutocompleteDocument,
    buildAutocompleteResource,
    buildLocalityAutocompleteDocument,
    buildLocalityAutocompleteResource,
    buildLocalityDetailDocument,
    buildLocalityResource,
    buildPaginationLinks,
    buildPaginationMeta,
    clearAddresses,
    extractAddressId,
    extractLocalityId,
    generateSearchCacheKey,
    getOpenSearchCircuit,
    getSearchCache,
} from "./helpers";
import { setLinkOptions } from "./setLinkOptions";
import type * as Types from "./types/index";

/**
 * Make the file system promises available globally.
 */
export const fsp = fs.promises;
export const { readdir } = fsp;

/**
 * Loggers for the API.
 */
export const logger = debug("api");
export const error = debug("error");

/**
 * The cache for the API.
 */
export const cache = new Keyv({
    store: new KeyvFile({ filename: "target/keyv-file.msgpack" }),
});

/**
 * Persistent HTTP cache for Got requests to avoid re-downloading unchanged payloads.
 */
export const gnafHttpCache = new Keyv({
    store: new KeyvFile({ filename: "target/gnaf-http-cache.msgpack" }),
    namespace: "gnaf-http-cache",
});

/**
 * Shared keep-alive HTTPS agent to reuse sockets across fetches.
 */
export const keepAliveAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 10,
});

/**
 * Got client configured for persistent HTTP cache reuse and keep-alive sockets.
 */
export const gotClient = got.extend({
    cache: gnafHttpCache,
    agent: { http: keepAliveAgent, https: keepAliveAgent },
});

// ---------------------------------------------------------------------------------

/**
 * Sets the addresses in the index.
 *
 * @param addr - The addresses to set.
 */
const setAddresses = async (addr: Types.IndexableAddress[]) => {
    // Clear the addresses index
    await clearAddresses();

    // Create the indexing body
    const indexingBody: Types.BulkIndexBody = [];

    // Loop through the addresses and build index operations
    for (const row of addr) {
        // Add the index operation header
        indexingBody.push({
            index: {
                _index: ES_INDEX_NAME,
                _id: row.links.self.href,
            },
        });

        // Destructure address components for the document body
        const { sla, ssla, ...structured } = row;

        // Extract confidence from nested structure or top-level (backwards compatible)
        const confidence =
            structured.structured?.confidence ?? structured.confidence;

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
        await sendIndexRequest(indexingBody);
    }
};

/**
 * Validates and normalizes search pagination parameters, coercing unsafe inputs
 * to safe defaults and clamping to avoid deep pagination.
 *
 * @param page - Raw page number (may be undefined, NaN, negative, or too large).
 * @param size - Raw page size (may be undefined, NaN, negative, or too large).
 * @returns Validated and clamped pagination parameters.
 */
const validatePaginationParams = (
    page: number | undefined,
    size: number | undefined,
): { validPage: number; validSize: number } => {
    // Coerce to numbers and default when inputs are not finite
    const safePage = Number.isFinite(page) ? (page as number) : 1;
    const safeSize = Number.isFinite(size) ? (size as number) : PAGE_SIZE;

    // Ensure page is at least 1 and at most MAX_PAGE_NUMBER
    const validPage = Math.max(1, Math.min(safePage, MAX_PAGE_NUMBER));

    // Ensure size is at least 1 and at most MAX_PAGE_SIZE
    const validSize = Math.max(1, Math.min(safeSize, MAX_PAGE_SIZE));

    return { validPage, validSize };
};

/**
 * Normalizes inbound search strings to reduce permutations and block accidental
 * match-all queries caused by blank or whitespace-only input.
 *
 * @param searchString - Raw search string supplied by the caller.
 * @returns Normalized search string (trimmed, single-spaced, or empty string).
 */
const normalizeSearchString = (searchString: string | undefined): string =>
    (searchString ?? "").trim().replace(/\s+/g, " ");

/**
 * Checks if the address index is empty (contains no documents).
 *
 * This function queries OpenSearch for the total document count in the address
 * index. Used to provide helpful warnings when users query an empty dataset.
 *
 * @returns A promise resolving to true if the index is empty or doesn't exist, false otherwise.
 */
const isIndexEmpty = async (): Promise<boolean> => {
    try {
        const circuit = getOpenSearchCircuit();
        const countResponse = await circuit.execute(async () => {
            return await (global.esClient as Types.OpensearchClient).count({
                index: ES_INDEX_NAME,
            });
        });
        return countResponse.body.count === 0;
    } catch {
        // If we can't determine the count (index not found, etc.), assume empty
        return true;
    }
};

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
const searchForAddress = async (
    searchString: string,
    p: number | undefined,
    pageSize: number | undefined = PAGE_SIZE,
): Promise<Types.SearchForAddressResult> => {
    // Normalize the inbound search string to reduce query permutations
    const normalizedSearch = normalizeSearchString(searchString);

    // Reject empty searches to avoid expensive match-all queries
    if (normalizedSearch === "") {
        throw new Error("Search query must not be empty after normalization");
    }

    // Validate and clamp pagination parameters to prevent abuse
    const { validPage, validSize } = validatePaginationParams(p, pageSize);

    // Generate cache key for this search query
    const cacheKey = generateSearchCacheKey(
        normalizedSearch,
        validPage,
        validSize,
    );

    // Check cache first if enabled
    if (CACHE_ENABLED) {
        const cached = getSearchCache().get(cacheKey);
        if (cached !== undefined) {
            if (VERBOSE) logger("Cache HIT for search:", normalizedSearch);
            // Return cached result wrapped in expected format
            return {
                searchResponse: {
                    body: {
                        hits: {
                            hits: cached.results as Types.AddressSearchHit[],
                            total: { value: cached.totalHits, relation: "eq" },
                        },
                    },
                } as Types.OpensearchApiResponse<
                    Types.OpensearchSearchResponse<unknown>,
                    unknown
                >,
                page: cached.page,
                size: cached.size,
                totalHits: cached.totalHits,
            };
        }
    }

    // Calculate the offset for OpenSearch (0-indexed)
    const from = (validPage - 1) * validSize;

    // Execute search with circuit breaker protection
    const circuit = getOpenSearchCircuit();

    const searchResp = await circuit.execute(async () => {
        // Search the index for the address
        return (await (global.esClient as Types.OpensearchClient).search({
            index: ES_INDEX_NAME,
            body: {
                from,
                size: validSize,
                // Limit payload to fields required by the response mapper
                _source: ["sla"],
                query: {
                    bool: {
                        // If the search string is not empty, add the search string to the query using a multi match query to
                        // search against the `sla` and `ssla` fields
                        ...(normalizedSearch && {
                            should: [
                                // Highest boost: Address starts with the search query (exact prefix match)
                                // This ensures "50 ST GEORGES TCE" ranks above "UNIT 1, 50 ST GEORGES TCE"
                                {
                                    prefix: {
                                        "sla.raw": {
                                            value: normalizedSearch.toUpperCase(),
                                            boost: 100,
                                        },
                                    },
                                },
                                // High boost: Short single-line address starts with search query
                                {
                                    prefix: {
                                        "ssla.raw": {
                                            value: normalizedSearch.toUpperCase(),
                                            boost: 80,
                                        },
                                    },
                                },
                                // Medium boost: Phrase prefix match (sequential term matching)
                                {
                                    multi_match: {
                                        fields: ["sla^2", "ssla"],
                                        query: normalizedSearch,
                                        type: "phrase_prefix",
                                        lenient: true,
                                        auto_generate_synonyms_phrase_query: false,
                                        boost: 10,
                                    },
                                },
                                // Lower boost: Fuzzy bool_prefix for typo tolerance
                                {
                                    multi_match: {
                                        fields: ["sla", "ssla"],
                                        query: normalizedSearch,
                                        fuzziness: "AUTO",
                                        type: "bool_prefix",
                                        lenient: true,
                                        auto_generate_synonyms_phrase_query: false,
                                        operator: "AND",
                                    },
                                },
                            ],
                        }),
                    },
                },
                sort: [
                    "_score",
                    { confidence: { order: "desc" } },
                    { "ssla.raw": { order: "asc" } },
                    { "sla.raw": { order: "asc" } },
                ],
            },
        })) as Types.OpensearchApiResponse<
            Types.OpensearchSearchResponse<unknown>,
            unknown
        >;
    });

    // Extract the total hit count for pagination calculations
    const rawTotal = searchResp.body.hits.total;
    const totalHits = typeof rawTotal === "number" ? rawTotal : rawTotal.value;

    // Cache the result if caching is enabled
    if (CACHE_ENABLED) {
        const cacheEntry: CachedSearchResult = {
            results: searchResp.body.hits.hits,
            totalHits: totalHits ?? 0,
            page: validPage,
            size: validSize,
        };
        getSearchCache().set(cacheKey, cacheEntry);
        if (VERBOSE) logger("Cache SET for search:", normalizedSearch);
    }

    // Log the hits
    if (VERBOSE)
        logger("hits", JSON.stringify(searchResp.body.hits, undefined, 2));
    return {
        searchResponse: searchResp,
        page: validPage,
        size: validSize,
        totalHits: totalHits ?? 0,
    };
};

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
const getAddress = async (
    addressId: string,
): Promise<Types.GetAddressResponse> => {
    try {
        // Get the circuit breaker for OpenSearch operations
        const circuit = getOpenSearchCircuit();

        // Query OpenSearch for the address document by its canonical path ID
        // Protected by circuit breaker to prevent cascading failures
        const jsonX = await circuit.execute(async () => {
            return await (global.esClient as Types.OpensearchClient).get({
                index: ES_INDEX_NAME,
                id: `/addresses/${addressId}`,
            });
        });

        if (VERBOSE) logger("jsonX", jsonX);

        // Extract the source data from OpenSearch response
        const source = jsonX.body._source;

        // Handle the nested data structure from OpenSearch
        // Some fields are in source.structured.structured (double nesting from indexing)
        // Some fields are directly in source.structured
        // Some fields are at the root level of source
        const struct = source.structured ?? {};
        const innerStruct = struct.structured ?? {};

        // Build the JSON:API address detail attributes
        const attributes: Types.AddressDetailAttributes = {
            pid: addressId,
            sla: source.sla,
            ...(source.ssla !== undefined && { ssla: source.ssla }),
            // mla can be at root level or in structured
            ...((source.mla ?? struct.mla) !== undefined && {
                mla: source.mla ?? struct.mla,
            }),
            ...((source.smla ?? struct.smla) !== undefined && {
                smla: source.smla ?? struct.smla,
            }),
            structured: {
                // Check both inner structured and outer structured for each field
                ...((innerStruct.buildingName ?? struct.buildingName) !==
                    undefined && {
                    buildingName:
                        innerStruct.buildingName ?? struct.buildingName,
                }),
                ...((innerStruct.lotNumber ?? struct.lotNumber) !==
                    undefined && {
                    lotNumber: innerStruct.lotNumber ?? struct.lotNumber,
                }),
                ...((innerStruct.flat ?? struct.flat) !== undefined && {
                    flat: innerStruct.flat ?? struct.flat,
                }),
                ...((innerStruct.level ?? struct.level) !== undefined && {
                    level: innerStruct.level ?? struct.level,
                }),
                ...((innerStruct.number ?? struct.number) !== undefined && {
                    number: innerStruct.number ?? struct.number,
                }),
                ...((innerStruct.street ?? struct.street) !== undefined && {
                    street: innerStruct.street ?? struct.street,
                }),
                ...((innerStruct.locality ?? struct.locality) !== undefined && {
                    locality: innerStruct.locality ?? struct.locality,
                }),
                ...((innerStruct.state ?? struct.state) !== undefined && {
                    state: innerStruct.state ?? struct.state,
                }),
                ...((innerStruct.postcode ?? struct.postcode) !== undefined && {
                    postcode: innerStruct.postcode ?? struct.postcode,
                }),
                ...((innerStruct.confidence ?? struct.confidence) !==
                    undefined && {
                    confidence: innerStruct.confidence ?? struct.confidence,
                }),
            },
            ...((innerStruct.geo ?? struct.geo) !== undefined && {
                geo: innerStruct.geo ?? struct.geo,
            }),
        };

        // Build the JSON:API resource and document
        const resource = buildAddressResource(addressId, attributes);
        const jsonApiDocument = buildAddressDetailDocument(resource);

        if (VERBOSE) logger("jsonApiDocument", jsonApiDocument);

        // Construct HATEOAS self-link for the address resource
        const link = new LinkHeader();
        link.set({
            rel: "self",
            uri: `/addresses/${addressId}`,
        });

        // Use pre-computed hash from document if available, otherwise compute on-the-fly
        // Pre-computed hashes are stored during indexing for better performance
        const precomputedHash = source.documentHash;
        const hash =
            precomputedHash ??
            crypto
                .createHash("md5")
                .update(JSON.stringify(jsonApiDocument))
                .digest("hex");

        return { link, json: jsonApiDocument as Record<string, unknown>, hash };
    } catch (error_: unknown) {
        // Handle circuit breaker open state (503 - service temporarily unavailable)
        if (error_ instanceof CircuitOpenError) {
            error("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable(
                    retryAfterSeconds,
                ) as Record<string, unknown>,
            };
        }

        // Cast to OpenSearch error type for proper error handling
        const osError = error_ as Types.OpensearchError;
        error("error getting record from elastic search", osError);

        // Handle document not found (404)
        if (osError.body?.found === false) {
            return {
                statusCode: 404,
                json: ErrorDocuments.notFound("address", addressId) as Record<
                    string,
                    unknown
                >,
            };
        }

        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Fallback for unexpected errors (500)
        return {
            statusCode: 500,
            json: ErrorDocuments.internalError() as Record<string, unknown>,
        };
    }
};

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
const getAddresses = async (
    url: string,
    swagger: Types.SwaggerContext,
    q?: string,
    p = 1,
): Promise<Types.GetAddressesResponse> => {
    try {
        // Normalize inbound search to prevent match-all scans on empty input
        const normalizedQuery = normalizeSearchString(q);
        if (normalizedQuery === "") {
            return {
                statusCode: 400,
                json: ErrorDocuments.badRequest(
                    "The 'q' query parameter is required and must not be empty.",
                    "q",
                ) as Record<string, unknown>,
            };
        }

        // Execute the address search query against the index
        const {
            searchResponse: foundAddresses,
            page,
            size,
            totalHits,
        } = await searchForAddress(normalizedQuery, p);
        if (VERBOSE) logger("foundAddresses", foundAddresses);

        // Calculate pagination values
        const totalPages = Math.ceil(totalHits / size);

        // Build JSON:API autocomplete resources from search hits
        const resources = mapToJsonApiAutocompleteResponse(foundAddresses);

        // Build JSON:API pagination links
        const jsonApiLinks = buildPaginationLinks(
            url,
            normalizedQuery,
            page,
            totalPages,
        );

        // Add API documentation link
        jsonApiLinks.describedby = {
            href: `/docs/#operations-${swagger.path.get[
                "x-swagger-router-controller"
            ].toLowerCase()}-${swagger.path.get.operationId}`,
            title: `${swagger.path.get.operationId} API Docs`,
            type: "text/html",
        };

        // Determine if a warning should be included in the response
        let warning: string | undefined;
        if (totalHits === 0) {
            // Check if the entire dataset is empty vs. just no results for this query
            const datasetEmpty = await isIndexEmpty();
            warning = datasetEmpty
                ? API_WARNINGS.EMPTY_DATASET
                : API_WARNINGS.NO_RESULTS;
        }

        // Build JSON:API pagination metadata (with optional warning)
        const meta = buildPaginationMeta(
            totalHits,
            page,
            size,
            undefined,
            warning,
        );

        // Build the complete JSON:API document
        const jsonApiDocument = buildAutocompleteDocument(
            resources,
            jsonApiLinks,
            meta,
        );

        if (VERBOSE)
            logger(
                "jsonApiDocument",
                JSON.stringify(jsonApiDocument, undefined, 2),
            );

        // Initialize the Link header for HATEOAS navigation (kept for backwards compatibility)
        const link = new LinkHeader();

        // Add link to API documentation for this operation
        link.set({
            rel: "describedby",
            uri: `/docs/#operations-${swagger.path.get[
                "x-swagger-router-controller"
            ].toLowerCase()}-${swagger.path.get.operationId}`,
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
            uri: `${url}${normalizedQuery === "" ? "" : "?"}${new URLSearchParams(
                {
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                },
            ).toString()}`,
        });

        // Add previous page link if not on the first page
        if (page > 1) {
            link.set({
                rel: "prev",
                uri: `${url}${
                    normalizedQuery === "" && page === 2 ? "" : "?"
                }${new URLSearchParams({
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                    ...(page > 2 && { "page[number]": String(page - 1) }),
                }).toString()}`,
            });
        }

        if (VERBOSE) logger("TOTAL", totalHits);
        if (VERBOSE) logger("PAGE_SIZE * p", size * page);

        // Determine if there are more pages available
        const hasNextPage = totalHits > size * page;
        if (VERBOSE) logger("next?", hasNextPage);

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
        setLinkOptions(op, url, linkTemplate);

        // Return JSON:API document instead of legacy format
        return {
            link,
            json: jsonApiDocument as Record<string, unknown>,
            linkTemplate,
        };
    } catch (error_: unknown) {
        // Handle circuit breaker open state (503 - service temporarily unavailable)
        if (error_ instanceof CircuitOpenError) {
            error("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable(
                    retryAfterSeconds,
                ) as Record<string, unknown>,
            };
        }

        // Cast to OpenSearch error type for proper error handling
        const osError = error_ as Types.OpensearchError;
        error("error querying elastic search", osError);

        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Handle OpenSearch request timeout (504)
        if (osError.displayName === "RequestTimeout") {
            return {
                statusCode: 504,
                json: ErrorDocuments.gatewayTimeout() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Fallback for unexpected errors (500)
        return {
            statusCode: 500,
            json: ErrorDocuments.internalError() as Record<string, unknown>,
        };
    }
};

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
const mapToJsonApiAutocompleteResponse = (
    foundAddresses: Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >,
): Types.JsonApiResource<Types.AddressAutocompleteAttributes>[] => {
    // Get the maximum score for normalization (first result typically has highest score)
    const maxScore = foundAddresses.body.hits.hits[0]
        ? (foundAddresses.body.hits.hits[0] as Types.AddressSearchHit)._score
        : 1;

    // Map each hit to a JSON:API resource, normalizing scores to 0-1 range
    return foundAddresses.body.hits.hits.map((h) => {
        // Cast hit to the expected structure for type-safe access
        const hit = h as Types.AddressSearchHit;

        // Extract the address ID from the document path (remove /addresses/ prefix)
        const addressId = extractAddressId(hit._id);

        // Normalize score to 0-1 range relative to the best match
        const normalizedRank = maxScore > 0 ? hit._score / maxScore : 0;

        // Build and return the JSON:API autocomplete resource
        return buildAutocompleteResource(
            addressId,
            hit._source.sla,
            normalizedRank,
            hit._source.ssla,
        );
    });
};

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
const mapToSearchAddressResponse = (
    foundAddresses: Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >,
): Types.AddressSearchResult[] => {
    // Map each hit to the API response format, extracting relevant fields
    return foundAddresses.body.hits.hits.map((h) => {
        // Cast hit to the expected structure for type-safe access
        const hit = h as Types.AddressSearchHit;
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

// ============================================================================
// Locality Service Functions
// ============================================================================

/**
 * Locality search hit structure from OpenSearch.
 */
type LocalitySearchHit = {
    _id: string;
    _score: number;
    _source: {
        display: string;
        name: string;
        localityPid: string;
        stateAbbreviation?: string;
        stateName?: string;
        postcode?: string;
        postcodes?: string[];
        classCode?: string;
        className?: string;
    };
};

/**
 * Checks if the locality index is empty (contains no documents).
 *
 * @returns A promise resolving to true if the index is empty or doesn't exist, false otherwise.
 */
const isLocalityIndexEmpty = async (): Promise<boolean> => {
    try {
        const circuit = getOpenSearchCircuit();
        const countResponse = await circuit.execute(async () => {
            return await (global.esClient as Types.OpensearchClient).count({
                index: ES_LOCALITY_INDEX_NAME,
            });
        });
        return countResponse.body.count === 0;
    } catch {
        // If we can't determine the count (index not found, etc.), assume empty
        return true;
    }
};

/**
 * Searches for localities matching a query string.
 *
 * @param searchString - The search string to match against localities.
 * @param p - The page number (1-indexed).
 * @param pageSize - The page size.
 * @returns A promise resolving to the OpenSearch search response with pagination metadata.
 */
const searchForLocality = async (
    searchString: string,
    p: number | undefined,
    pageSize: number | undefined = PAGE_SIZE,
): Promise<Types.SearchForAddressResult> => {
    // Normalize the inbound search string
    const normalizedSearch = (searchString ?? "").trim().replace(/\s+/g, " ");

    // Reject empty searches
    if (normalizedSearch === "") {
        throw new Error("Search query must not be empty after normalization");
    }

    // Validate pagination parameters
    const safePage = Number.isFinite(p) ? (p as number) : 1;
    const safeSize = Number.isFinite(pageSize)
        ? (pageSize as number)
        : PAGE_SIZE;
    const validPage = Math.max(1, Math.min(safePage, MAX_PAGE_NUMBER));
    const validSize = Math.max(1, Math.min(safeSize, MAX_PAGE_SIZE));

    // Calculate the offset for OpenSearch
    const from = (validPage - 1) * validSize;

    // Execute search with circuit breaker protection
    const circuit = getOpenSearchCircuit();

    const searchResp = await circuit.execute(async () => {
        return (await (global.esClient as Types.OpensearchClient).search({
            index: ES_LOCALITY_INDEX_NAME,
            body: {
                from,
                size: validSize,
                _source: [
                    "display",
                    "name",
                    "localityPid",
                    "stateAbbreviation",
                    "stateName",
                    "postcode",
                    "postcodes",
                    "classCode",
                    "className",
                ],
                query: {
                    bool: {
                        should: [
                            // Highest boost: Display starts with the search query (exact prefix match)
                            {
                                prefix: {
                                    "display.raw": {
                                        value: normalizedSearch.toUpperCase(),
                                        boost: 100,
                                    },
                                },
                            },
                            // High boost: Locality name starts with search query
                            {
                                prefix: {
                                    "name.raw": {
                                        value: normalizedSearch.toUpperCase(),
                                        boost: 80,
                                    },
                                },
                            },
                            // Medium boost: Postcode match
                            {
                                term: {
                                    postcode: {
                                        value: normalizedSearch,
                                        boost: 60,
                                    },
                                },
                            },
                            // Medium boost: Match on any of the postcodes
                            {
                                term: {
                                    postcodes: {
                                        value: normalizedSearch,
                                        boost: 50,
                                    },
                                },
                            },
                            // Phrase prefix match on display
                            {
                                match_phrase_prefix: {
                                    display: {
                                        query: normalizedSearch,
                                        boost: 40,
                                    },
                                },
                            },
                            // Phrase prefix match on name
                            {
                                match_phrase_prefix: {
                                    name: {
                                        query: normalizedSearch,
                                        boost: 30,
                                    },
                                },
                            },
                            // Fuzzy match for typo tolerance
                            {
                                multi_match: {
                                    fields: ["display", "name"],
                                    query: normalizedSearch,
                                    fuzziness: "AUTO",
                                    type: "bool_prefix",
                                    lenient: true,
                                    operator: "AND",
                                },
                            },
                        ],
                    },
                },
                sort: ["_score", { "name.raw": { order: "asc" } }],
            },
        })) as Types.OpensearchApiResponse<
            Types.OpensearchSearchResponse<unknown>,
            unknown
        >;
    });

    // Extract the total hit count
    const rawTotal = searchResp.body.hits.total;
    const totalHits = typeof rawTotal === "number" ? rawTotal : rawTotal.value;

    return {
        searchResponse: searchResp,
        page: validPage,
        size: validSize,
        totalHits: totalHits ?? 0,
    };
};

/**
 * Retrieves detailed information about a specific locality by its ID.
 *
 * @param localityId - The unique identifier for the locality (G-NAF Locality PID).
 * @returns A promise resolving to the locality response.
 */
const getLocality = async (
    localityId: string,
): Promise<Types.GetAddressResponse> => {
    try {
        // Get the circuit breaker for OpenSearch operations
        const circuit = getOpenSearchCircuit();

        // Query OpenSearch for the locality document
        const jsonX = await circuit.execute(async () => {
            return await (global.esClient as Types.OpensearchClient).get({
                index: ES_LOCALITY_INDEX_NAME,
                id: `/localities/${localityId}`,
            });
        });

        if (VERBOSE) logger("locality jsonX", jsonX);

        // Extract the source data from OpenSearch response
        const source = jsonX.body._source as LocalitySearchHit["_source"];

        // Build the JSON:API locality detail attributes
        const attributes: Types.LocalityDetailAttributes = {
            localityPid: source.localityPid,
            name: source.name,
            display: source.display,
            ...(source.classCode !== undefined && {
                class: {
                    code: source.classCode,
                    name: source.className,
                },
            }),
            ...(source.stateAbbreviation !== undefined && {
                state: {
                    name: source.stateName,
                    abbreviation: source.stateAbbreviation,
                },
            }),
            ...(source.postcode !== undefined && { postcode: source.postcode }),
            ...(source.postcodes !== undefined && {
                postcodes: source.postcodes,
            }),
        };

        // Build the JSON:API resource and document
        const resource = buildLocalityResource(localityId, attributes);
        const jsonApiDocument = buildLocalityDetailDocument(resource);

        // Construct HATEOAS self-link for the locality resource
        const link = new LinkHeader();
        link.set({
            rel: "self",
            uri: `/localities/${localityId}`,
        });

        // Compute hash for ETag
        const hash = crypto
            .createHash("md5")
            .update(JSON.stringify(jsonApiDocument))
            .digest("hex");

        return { link, json: jsonApiDocument as Record<string, unknown>, hash };
    } catch (error_: unknown) {
        // Handle circuit breaker open state
        if (error_ instanceof CircuitOpenError) {
            error("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable(
                    retryAfterSeconds,
                ) as Record<string, unknown>,
            };
        }

        // Cast to OpenSearch error type
        const osError = error_ as Types.OpensearchError;
        error("error getting locality from elastic search", osError);

        // Handle document not found
        if (osError.body?.found === false) {
            return {
                statusCode: 404,
                json: ErrorDocuments.notFound("locality", localityId) as Record<
                    string,
                    unknown
                >,
            };
        }

        // Handle index not ready/available
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Fallback for unexpected errors
        return {
            statusCode: 500,
            json: ErrorDocuments.internalError() as Record<string, unknown>,
        };
    }
};

/**
 * Searches for localities matching a query string with pagination support.
 *
 * @param url - The base URL for the localities endpoint.
 * @param swagger - Swagger/OpenAPI context for API documentation linkage.
 * @param q - The search query string for locality matching.
 * @param p - The page number for pagination (1-indexed).
 * @returns A promise resolving to the localities response.
 */
const getLocalities = async (
    url: string,
    swagger: Types.SwaggerContext,
    q?: string,
    p = 1,
): Promise<Types.GetAddressesResponse> => {
    try {
        // Normalize inbound search
        const normalizedQuery = (q ?? "").trim().replace(/\s+/g, " ");
        if (normalizedQuery === "") {
            return {
                statusCode: 400,
                json: ErrorDocuments.badRequest(
                    "The 'q' query parameter is required and must not be empty.",
                    "q",
                ) as Record<string, unknown>,
            };
        }

        // Execute the locality search query
        const {
            searchResponse: foundLocalities,
            page,
            size,
            totalHits,
        } = await searchForLocality(normalizedQuery, p);

        if (VERBOSE) logger("foundLocalities", foundLocalities);

        // Calculate pagination values
        const totalPages = Math.ceil(totalHits / size);

        // Build JSON:API autocomplete resources from search hits
        const maxScore = foundLocalities.body.hits.hits[0]
            ? (foundLocalities.body.hits.hits[0] as LocalitySearchHit)._score
            : 1;

        const resources = foundLocalities.body.hits.hits.map((h) => {
            const hit = h as LocalitySearchHit;
            const localityId = extractLocalityId(hit._id);
            const normalizedRank = maxScore > 0 ? hit._score / maxScore : 0;
            return buildLocalityAutocompleteResource(
                localityId,
                hit._source.display,
                normalizedRank,
            );
        });

        // Build JSON:API pagination links
        const jsonApiLinks = buildPaginationLinks(
            url,
            normalizedQuery,
            page,
            totalPages,
        );

        // Add API documentation link
        jsonApiLinks.describedby = {
            href: `/docs/#operations-${swagger.path.get[
                "x-swagger-router-controller"
            ].toLowerCase()}-${swagger.path.get.operationId}`,
            title: `${swagger.path.get.operationId} API Docs`,
            type: "text/html",
        };

        // Determine if a warning should be included
        let warning: string | undefined;
        if (totalHits === 0) {
            const datasetEmpty = await isLocalityIndexEmpty();
            warning = datasetEmpty
                ? API_WARNINGS.EMPTY_LOCALITY_DATASET
                : API_WARNINGS.NO_LOCALITY_RESULTS;
        }

        // Build JSON:API pagination metadata
        const meta = buildPaginationMeta(
            totalHits,
            page,
            size,
            undefined,
            warning,
        );

        // Build the complete JSON:API document
        const jsonApiDocument = buildLocalityAutocompleteDocument(
            resources,
            jsonApiLinks,
            meta,
        );

        // Initialize the Link header for HATEOAS navigation
        const link = new LinkHeader();

        // Add link to API documentation
        link.set({
            rel: "describedby",
            uri: `/docs/#operations-${swagger.path.get[
                "x-swagger-router-controller"
            ].toLowerCase()}-${swagger.path.get.operationId}`,
            title: `${swagger.path.get.operationId} API Docs`,
            type: "text/html",
        });

        // Build query string for the current request
        const sp = new URLSearchParams({
            ...(normalizedQuery !== "" && { q: normalizedQuery }),
            ...(page !== 1 && { "page[number]": String(page) }),
        });
        const spString = sp.toString();

        // Add self-referential link
        link.set({
            rel: "self",
            uri: `${url}${spString === "" ? "" : "?"}${spString}`,
        });

        // Add link to the first page
        link.set({
            rel: "first",
            uri: `${url}${normalizedQuery === "" ? "" : "?"}${new URLSearchParams(
                {
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                },
            ).toString()}`,
        });

        // Add previous page link if not on first page
        if (page > 1) {
            link.set({
                rel: "prev",
                uri: `${url}${
                    normalizedQuery === "" && page === 2 ? "" : "?"
                }${new URLSearchParams({
                    ...(normalizedQuery !== "" && { q: normalizedQuery }),
                    ...(page > 2 && { "page[number]": String(page - 1) }),
                }).toString()}`,
            });
        }

        // Determine if there are more pages available
        const hasNextPage = totalHits > size * page;

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

        // Construct Link-Template header
        const linkTemplate = new LinkHeader();
        const op = swagger.path.get;
        setLinkOptions(op, url, linkTemplate);

        return {
            link,
            json: jsonApiDocument as Record<string, unknown>,
            linkTemplate,
        };
    } catch (error_: unknown) {
        // Handle circuit breaker open state
        if (error_ instanceof CircuitOpenError) {
            error("Circuit breaker open for OpenSearch", error_);
            const retryAfterSeconds = Math.ceil(error_.retryAfterMs / 1000);
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable(
                    retryAfterSeconds,
                ) as Record<string, unknown>,
            };
        }

        // Cast to OpenSearch error type
        const osError = error_ as Types.OpensearchError;
        error("error querying localities in elastic search", osError);

        // Handle index not ready/available
        if (osError.body?.error?.type === "index_not_found_exception") {
            return {
                statusCode: 503,
                json: ErrorDocuments.serviceUnavailable() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Handle OpenSearch request timeout
        if (osError.displayName === "RequestTimeout") {
            return {
                statusCode: 504,
                json: ErrorDocuments.gatewayTimeout() as Record<
                    string,
                    unknown
                >,
            };
        }

        // Fallback for unexpected errors
        return {
            statusCode: 500,
            json: ErrorDocuments.internalError() as Record<string, unknown>,
        };
    }
};

/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
export default {
    load: loadCommandEntry,
    autocomplete: getAddresses,
    lookup: getAddress,
    localityAutocomplete: getLocalities,
    localityLookup: getLocality,
};

/**
 * Named exports for direct function access (useful for testing and controllers).
 */
export {
    getAddress,
    getAddresses,
    getLocality,
    getLocalities,
    mapToSearchAddressResponse,
    mapToJsonApiAutocompleteResponse,
    setAddresses,
    searchForAddress,
    searchForLocality,
};
