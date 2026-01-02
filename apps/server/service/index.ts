import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import debug from "debug";
import * as got from "got";
import * as LinkHeader from "http-link-header";
import * as Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import { loadCommandEntry, sendIndexRequest } from "./commands/load";
import { PAGE_SIZE, ES_INDEX_NAME } from "./conf";
import { clearAddresses } from "./helpers";
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

    // Loop through the addresses
    for (const row of addr) {
        // Add the index operation to the body
        indexingBody.push({
            index: {
                _index: ES_INDEX_NAME,
                _id: row.links.self.href,
            },
        });

        // Add the address details to the body
        const { sla, ssla, ...structurted } = row;
        const confidence =
            structurted.structurted?.confidence ?? structurted.confidence;

        // Add the address details to the body
        indexingBody.push({
            sla,
            ssla,
            structurted,
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
 * Searches for an address in the index.
 *
 * @augments autoCompleteAddress - This function is part of the autocomplete (searching) functionality of the service
 *
 * @param searchString - The search string.
 * @param p - The page number.
 * @param pageSize - The page size.
 * @returns {Promise<Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>>} - A promise that resolves when the address is searched for.
 */
const searchForAddress = async (
    searchString: string,
    p: number,
    pageSize: number = PAGE_SIZE,
): Promise<
    Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >
> => {
    // Search the index for the address
    const searchResp = (await (
        global.esClient as Types.OpensearchClient
    ).search({
        index: ES_INDEX_NAME,
        body: {
            from: (p - 1 || 0) * pageSize,
            size: pageSize,
            query: {
                bool: {
                    // If the search string is not empty, add the search string to the query using a multi match query to
                    // search against the `sla` and `ssla` fields
                    ...(searchString && {
                        should: [
                            {
                                multi_match: {
                                    fields: ["sla", "ssla"],
                                    query: searchString,
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
                                    query: searchString,
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
            sort: [
                "_score",
                { confidence: { order: "desc" } },
                { "ssla.raw": { order: "asc" } },
                { "sla.raw": { order: "asc" } },
            ],
            highlight: {
                fields: {
                    sla: {},
                    ssla: {},
                },
            },
        },
    })) as Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >;

    // Log the hits
    logger("hits", JSON.stringify(searchResp.body.hits, undefined, 2));
    return searchResp;
};

/**
 * Retrieves detailed information about a specific address by its ID.
 *
 * This function queries OpenSearch for the address document, constructs the
 * response with proper HATEOAS links, and generates an ETag hash for caching.
 *
 * @param {string} addressId - The unique identifier for the address (G-NAF PID).
 * @returns {Promise<Types.GetAddressResponse>} A promise resolving to either:
 *   - Success: `{ link, json, hash }` containing the address data and navigation links
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and error message
 */
const getAddress = async (
    addressId: string,
): Promise<Types.GetAddressResponse> => {
    try {
        // Query OpenSearch for the address document by its canonical path ID
        const jsonX = await (global.esClient as Types.OpensearchClient).get({
            index: ES_INDEX_NAME,
            id: `/addresses/${addressId}`,
        });

        logger("jsonX", jsonX);

        // Extract and merge the structured address data with the SLA string
        const json: Record<string, unknown> & { sla: string } = {
            ...jsonX.body._source.structured,
            sla: jsonX.body._source.sla,
        };

        logger("json", json);

        // Remove internal OpenSearch ID field from response payload
        delete json._id;

        // Construct HATEOAS self-link for the address resource
        const link = new LinkHeader();
        link.set({
            rel: "self",
            uri: `/addresses/${addressId}`,
        });

        // Generate MD5 hash of the address data for ETag/caching support
        // TODO: Consider pre-computing and storing hash during indexing for performance
        const hash = crypto
            .createHash("md5")
            .update(JSON.stringify(json))
            .digest("hex");

        return { link, json, hash };
    } catch (error_: unknown) {
        // Cast to OpenSearch error type for proper error handling
        const osError = error_ as Types.OpensearchError;
        error("error getting record from elastic search", osError);

        // Handle document not found (404)
        if (osError.body?.found === false) {
            return { statusCode: 404, json: { error: "not found" } };
        }

        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return { statusCode: 503, json: { error: "service unavailable" } };
        }

        // Fallback for unexpected errors (500)
        return { statusCode: 500, json: { error: "unexpected error" } };
    }
};

/**
 * Searches for addresses matching a query string with pagination support.
 *
 * This function performs a fuzzy search against the address index, constructing
 * proper HATEOAS pagination links and API discovery templates in the response.
 *
 * @param {string} url - The base URL for the addresses endpoint (used for link construction).
 * @param {Types.SwaggerContext} swagger - Swagger/OpenAPI context for API documentation linkage.
 * @param {string} [q] - The search query string for address matching.
 * @param {number} [p=1] - The page number for pagination (1-indexed).
 * @returns {Promise<Types.GetAddressesResponse>} A promise resolving to either:
 *   - Success: `{ link, json, linkTemplate }` containing search results and navigation
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and error message
 */
const getAddresses = async (
    url: string,
    swagger: Types.SwaggerContext,
    q?: string,
    p = 1,
): Promise<Types.GetAddressesResponse> => {
    try {
        // Execute the address search query against the index
        const foundAddresses = await searchForAddress(q ?? "", p);
        logger("foundAddresses", foundAddresses);

        // Initialize the Link header for HATEOAS navigation
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
            ...(q !== undefined && { q }),
            ...(p !== 1 && { p: String(p) }),
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
            uri: `${url}${q === undefined ? "" : "?"}${new URLSearchParams({
                ...(q !== undefined && { q }),
            }).toString()}`,
        });

        // Add previous page link if not on the first page
        if (p > 1) {
            link.set({
                rel: "prev",
                uri: `${url}${
                    q === undefined && p === 2 ? "" : "?"
                }${new URLSearchParams({
                    ...(q !== undefined && { q }),
                    ...(p > 2 && { p: String(p - 1) }),
                }).toString()}`,
            });
        }

        // Extract the total hit count for pagination calculations
        // OpenSearch returns total as either a number or a { value, relation } object
        const rawTotal = foundAddresses.body.hits.total;
        const totalHits =
            typeof rawTotal === "number" ? rawTotal : rawTotal.value;
        logger("TOTAL", totalHits);
        logger("PAGE_SIZE * p", PAGE_SIZE * p);

        // Determine if there are more pages available
        const hasNextPage = totalHits > PAGE_SIZE * p;
        logger("next?", hasNextPage);

        // Add next page link if more results exist
        if (hasNextPage) {
            link.set({
                rel: "next",
                uri: `${url}?${new URLSearchParams({
                    ...(q !== undefined && { q }),
                    p: String(p + 1),
                }).toString()}`,
            });
        }

        // Transform OpenSearch hits into the API response format
        const responseBody = mapToSearchAddressResponse(foundAddresses);
        logger("responseBody", JSON.stringify(responseBody, undefined, 2));

        // Construct Link-Template header for API discoverability (RFC 6570)
        const linkTemplate = new LinkHeader();
        const op = swagger.path.get;
        setLinkOptions(op, url, linkTemplate);

        return { link, json: responseBody, linkTemplate };
    } catch (error_: unknown) {
        // Cast to OpenSearch error type for proper error handling
        const osError = error_ as Types.OpensearchError;
        error("error querying elastic search", osError);

        // Handle index not ready/available (503)
        if (osError.body?.error?.type === "index_not_found_exception") {
            return { statusCode: 503, json: { error: "service unavailable" } };
        }

        // Handle OpenSearch request timeout (504)
        if (osError.displayName === "RequestTimeout") {
            return { statusCode: 504, json: { error: "gateway timeout" } };
        }

        // Fallback for unexpected errors (500)
        return { statusCode: 500, json: { error: "unexpected error" } };
    }
};

/**
 * Transforms raw OpenSearch search hits into the standardised API response format.
 *
 * This function maps the internal OpenSearch document structure to a clean,
 * client-facing response containing the address SLA, relevance score, and
 * HATEOAS self-links for each result.
 *
 * @param {Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>} foundAddresses -
 *   The raw OpenSearch search response containing hits.
 * @returns {Types.AddressSearchResult[]} An array of address results formatted for the API.
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

/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
export default {
    load: loadCommandEntry,
    autocomplete: getAddresses,
    lookup: getAddress,
};

/**
 * Named exports for direct function access (useful for testing and controllers).
 */
export {
    getAddress,
    getAddresses,
    mapToSearchAddressResponse,
    setAddresses,
    searchForAddress,
};
