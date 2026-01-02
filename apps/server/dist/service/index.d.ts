import * as fs from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import * as got from "got";
import * as Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import type * as Types from "./types/index";
/**
 * Make the file system promises available globally.
 */
export declare const fsp: typeof fs.promises;
export declare const readdir: typeof fs.promises.readdir;
/**
 * Loggers for the API.
 */
export declare const logger: import("debug").Debugger;
export declare const error: import("debug").Debugger;
/**
 * The cache for the API.
 */
export declare const cache: Keyv<any, {
    store: KeyvFile<any>;
}>;
/**
 * Persistent HTTP cache for Got requests to avoid re-downloading unchanged payloads.
 */
export declare const gnafHttpCache: Keyv<any, {
    store: KeyvFile<any>;
    namespace: string;
}>;
/**
 * Shared keep-alive HTTPS agent to reuse sockets across fetches.
 */
export declare const keepAliveAgent: HttpsAgent;
/**
 * Got client configured for persistent HTTP cache reuse and keep-alive sockets.
 */
export declare const gotClient: got.GotInstance<got.GotBodyFn<string>>;
/**
 * Sets the addresses in the index.
 *
 * @param addr - The addresses to set.
 */
declare const setAddresses: (addr: Types.IndexableAddress[]) => Promise<void>;
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
declare const searchForAddress: (searchString: string, p: number | undefined, pageSize?: number | undefined) => Promise<Types.SearchForAddressResult>;
/**
 * Retrieves detailed information about a specific address by its ID.
 *
 * This function queries OpenSearch for the address document, constructs the
 * response with proper HATEOAS links, and generates an ETag hash for caching.
 * Operations are protected by a circuit breaker to handle OpenSearch failures gracefully.
 *
 * @param {string} addressId - The unique identifier for the address (G-NAF PID).
 * @returns {Promise<Types.GetAddressResponse>} A promise resolving to either:
 *   - Success: `{ link, json, hash }` containing the address data and navigation links
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and error message
 */
declare const getAddress: (addressId: string) => Promise<Types.GetAddressResponse>;
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
declare const getAddresses: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
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
declare const mapToSearchAddressResponse: (foundAddresses: Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>) => Types.AddressSearchResult[];
/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
declare const _default: {
    load: ({ refresh, }?: {
        refresh?: boolean;
    }) => Promise<void>;
    autocomplete: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
    lookup: (addressId: string) => Promise<Types.GetAddressResponse>;
};
export default _default;
/**
 * Named exports for direct function access (useful for testing and controllers).
 */
export { getAddress, getAddresses, mapToSearchAddressResponse, setAddresses, searchForAddress, };
//# sourceMappingURL=index.d.ts.map