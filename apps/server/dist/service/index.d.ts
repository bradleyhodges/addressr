import * as fs from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import debug from "debug";
import * as got from "got";
import Keyv from "keyv";
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
export declare const logger: debug.Debugger;
export declare const error: debug.Debugger;
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
 * response as a JSON:API document with proper links, and generates an ETag hash
 * for caching. Operations are protected by a circuit breaker to handle OpenSearch
 * failures gracefully.
 *
 * @param {string} addressId - The unique identifier for the address (G-NAF PID).
 * @returns {Promise<Types.GetAddressResponse>} A promise resolving to either:
 *   - Success: `{ link, json, hash }` containing the JSON:API document and navigation links
 *   - Error: `{ statusCode, json }` with appropriate HTTP status and JSON:API error document
 */
declare const getAddress: (addressId: string) => Promise<Types.GetAddressResponse>;
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
declare const getAddresses: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
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
declare const mapToJsonApiAutocompleteResponse: (foundAddresses: Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>) => Types.JsonApiResource<Types.AddressAutocompleteAttributes>[];
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
declare const mapToSearchAddressResponse: (foundAddresses: Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>) => Types.AddressSearchResult[];
/**
 * Searches for localities matching a query string.
 *
 * @param searchString - The search string to match against localities.
 * @param p - The page number (1-indexed).
 * @param pageSize - The page size.
 * @returns A promise resolving to the OpenSearch search response with pagination metadata.
 */
declare const searchForLocality: (searchString: string, p: number | undefined, pageSize?: number | undefined) => Promise<Types.SearchForAddressResult>;
/**
 * Retrieves detailed information about a specific locality by its ID.
 *
 * @param localityId - The unique identifier for the locality (G-NAF Locality PID).
 * @returns A promise resolving to the locality response.
 */
declare const getLocality: (localityId: string) => Promise<Types.GetAddressResponse>;
/**
 * Searches for localities matching a query string with pagination support.
 *
 * @param url - The base URL for the localities endpoint.
 * @param swagger - Swagger/OpenAPI context for API documentation linkage.
 * @param q - The search query string for locality matching.
 * @param p - The page number for pagination (1-indexed).
 * @returns A promise resolving to the localities response.
 */
declare const getLocalities: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
declare const _default: {
    load: ({ refresh, }?: {
        refresh?: boolean;
    }) => Promise<void>;
    autocomplete: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
    lookup: (addressId: string) => Promise<Types.GetAddressResponse>;
    localityAutocomplete: (url: string, swagger: Types.SwaggerContext, q?: string, p?: number) => Promise<Types.GetAddressesResponse>;
    localityLookup: (localityId: string) => Promise<Types.GetAddressResponse>;
};
export default _default;
/**
 * Named exports for direct function access (useful for testing and controllers).
 */
export { getAddress, getAddresses, getLocality, getLocalities, mapToSearchAddressResponse, mapToJsonApiAutocompleteResponse, setAddresses, searchForAddress, searchForLocality, };
//# sourceMappingURL=index.d.ts.map