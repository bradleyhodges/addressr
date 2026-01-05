/**
 * JSON:API Response Builder Utilities
 *
 * Provides helper functions to construct JSON:API compliant response documents
 * for the AddressKit API. These utilities ensure consistent response formatting
 * across all endpoints.
 */
import type { AddressAutocompleteAttributes, AddressAutocompleteDocument, AddressDetailAttributes, AddressDetailDocument, JsonApiError, JsonApiErrorDocument, JsonApiLinks, JsonApiMeta, JsonApiResource, LocalityAutocompleteAttributes, LocalityAutocompleteDocument, LocalityDetailAttributes, LocalityDetailDocument } from "../types/jsonapi-types";
/**
 * Resource type constants for consistent naming across the API.
 */
export declare const RESOURCE_TYPES: {
    /** Resource type for address entities */
    readonly ADDRESS: "address";
    /** Resource type for autocomplete suggestions */
    readonly ADDRESS_SUGGESTION: "address-suggestion";
    /** Resource type for locality entities */
    readonly LOCALITY: "locality";
    /** Resource type for locality autocomplete suggestions */
    readonly LOCALITY_SUGGESTION: "locality-suggestion";
};
/**
 * Extracts the address ID from a full resource path.
 * Converts "/addresses/GANT_123456" to "GANT_123456".
 *
 * @param path - Full path including the resource prefix.
 * @returns The extracted address ID.
 */
export declare const extractAddressId: (path: string) => string;
/**
 * Extracts the locality ID from a full resource path.
 * Converts "/localities/NSW1234" to "NSW1234".
 *
 * @param path - Full path including the resource prefix.
 * @returns The extracted locality ID.
 */
export declare const extractLocalityId: (path: string) => string;
/**
 * Builds a JSON:API resource object for an autocomplete suggestion.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param sla - Single-line address string for display.
 * @param rank - Search relevance score (0-1 normalized).
 * @param ssla - Optional short single-line address.
 * @returns A JSON:API resource object for the autocomplete result.
 */
export declare const buildAutocompleteResource: (id: string, sla: string, rank: number, ssla?: string) => JsonApiResource<AddressAutocompleteAttributes>;
/**
 * Builds a JSON:API resource object for a detailed address.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param attributes - Complete address attributes including structured data.
 * @returns A JSON:API resource object for the address.
 */
export declare const buildAddressResource: (id: string, attributes: AddressDetailAttributes) => JsonApiResource<AddressDetailAttributes>;
/**
 * Builds a JSON:API resource object for a locality autocomplete suggestion.
 *
 * @param id - Unique identifier for the locality (G-NAF Locality PID).
 * @param display - Display string for the locality (e.g., "SYDNEY NSW 2000").
 * @param rank - Search relevance score (0-1 normalized).
 * @returns A JSON:API resource object for the locality autocomplete result.
 */
export declare const buildLocalityAutocompleteResource: (id: string, display: string, rank: number) => JsonApiResource<LocalityAutocompleteAttributes>;
/**
 * Builds a JSON:API resource object for a detailed locality.
 *
 * @param id - Unique identifier for the locality (G-NAF Locality PID).
 * @param attributes - Complete locality attributes including state and postcodes.
 * @returns A JSON:API resource object for the locality.
 */
export declare const buildLocalityResource: (id: string, attributes: LocalityDetailAttributes) => JsonApiResource<LocalityDetailAttributes>;
/**
 * Builds pagination links for a collection response.
 *
 * @param baseUrl - Base URL for the resource collection (e.g., "/addresses").
 * @param query - The search query string.
 * @param currentPage - Current page number (1-indexed).
 * @param totalPages - Total number of pages available.
 * @param pageSize - Number of items per page.
 * @returns JSON:API links object with pagination links.
 */
export declare const buildPaginationLinks: (baseUrl: string, query: string, currentPage: number, totalPages: number, pageSize?: number) => JsonApiLinks;
/**
 * Warning message constants for API responses.
 */
export declare const API_WARNINGS: {
    /** Warning when the address dataset is empty (no addresses loaded) */
    readonly EMPTY_DATASET: "No addresses are currently loaded in the dataset. Please run the data loader to populate the address index.";
    /** Warning when a search query returns no matching results */
    readonly NO_RESULTS: "No addresses matched your search query.";
    /** Warning when the locality dataset is empty (no localities loaded) */
    readonly EMPTY_LOCALITY_DATASET: "No localities are currently loaded in the dataset. Please run the data loader to populate the locality index.";
    /** Warning when a locality search query returns no matching results */
    readonly NO_LOCALITY_RESULTS: "No localities matched your search query.";
};
/**
 * Builds metadata for a paginated collection response.
 *
 * @param total - Total number of resources matching the query.
 * @param page - Current page number (1-indexed).
 * @param pageSize - Number of items per page.
 * @param responseTime - Optional query processing time in milliseconds.
 * @param warning - Optional warning message to include in meta.
 * @returns JSON:API meta object with pagination information.
 */
export declare const buildPaginationMeta: (total: number, page: number, pageSize: number, responseTime?: number, warning?: string) => JsonApiMeta;
/**
 * Builds a complete JSON:API document for autocomplete responses.
 *
 * @param resources - Array of autocomplete resource objects.
 * @param links - Pagination and navigation links.
 * @param meta - Response metadata including pagination info.
 * @returns Complete JSON:API document for autocomplete results.
 */
export declare const buildAutocompleteDocument: (resources: JsonApiResource<AddressAutocompleteAttributes>[], links: JsonApiLinks, meta: JsonApiMeta) => AddressAutocompleteDocument;
/**
 * Builds a complete JSON:API document for a single address detail response.
 *
 * @param resource - The address resource object.
 * @returns Complete JSON:API document for the address.
 */
export declare const buildAddressDetailDocument: (resource: JsonApiResource<AddressDetailAttributes>) => AddressDetailDocument;
/**
 * Builds a complete JSON:API document for locality autocomplete responses.
 *
 * @param resources - Array of locality autocomplete resource objects.
 * @param links - Pagination and navigation links.
 * @param meta - Response metadata including pagination info.
 * @returns Complete JSON:API document for locality autocomplete results.
 */
export declare const buildLocalityAutocompleteDocument: (resources: JsonApiResource<LocalityAutocompleteAttributes>[], links: JsonApiLinks, meta: JsonApiMeta) => LocalityAutocompleteDocument;
/**
 * Builds a complete JSON:API document for a single locality detail response.
 *
 * @param resource - The locality resource object.
 * @returns Complete JSON:API document for the locality.
 */
export declare const buildLocalityDetailDocument: (resource: JsonApiResource<LocalityDetailAttributes>) => LocalityDetailDocument;
/**
 * Builds a JSON:API error object.
 *
 * @param status - HTTP status code as a string.
 * @param title - Short human-readable summary of the error.
 * @param detail - Detailed explanation of the error.
 * @param code - Optional application-specific error code.
 * @param source - Optional error source information.
 * @returns JSON:API error object.
 */
export declare const buildError: (status: string, title: string, detail?: string, code?: string, source?: JsonApiError["source"]) => JsonApiError;
/**
 * Builds a complete JSON:API error document.
 *
 * @param errors - Array of error objects.
 * @param meta - Optional document-level metadata.
 * @returns Complete JSON:API error document.
 */
export declare const buildErrorDocument: (errors: JsonApiError[], meta?: Record<string, unknown>) => JsonApiErrorDocument;
/**
 * Common error document builders for standard HTTP errors.
 */
export declare const ErrorDocuments: {
    /**
     * Builds a 400 Bad Request error document.
     *
     * @param detail - Detailed explanation of what was invalid.
     * @param paramName - Optional parameter name that was invalid.
     * @returns JSON:API error document for bad request.
     */
    badRequest: (detail: string, paramName?: string) => JsonApiErrorDocument;
    /**
     * Builds a 400 Bad Request error document for missing required parameter.
     *
     * @param paramName - The name of the missing required parameter.
     * @returns JSON:API error document for missing parameter.
     */
    missingRequiredParameter: (paramName: string) => JsonApiErrorDocument;
    /**
     * Builds a 404 Not Found error document.
     *
     * @param resourceType - Type of resource that was not found.
     * @param resourceId - ID of the resource that was not found.
     * @returns JSON:API error document for not found.
     */
    notFound: (resourceType: string, resourceId: string) => JsonApiErrorDocument;
    /**
     * Builds a 500 Internal Server Error document.
     *
     * @param detail - Optional detail about the error (be careful not to leak internals).
     * @returns JSON:API error document for server error.
     */
    internalError: (detail?: string) => JsonApiErrorDocument;
    /**
     * Builds a 503 Service Unavailable error document.
     *
     * @param retryAfterSeconds - Optional retry-after hint in seconds.
     * @returns JSON:API error document for service unavailable.
     */
    serviceUnavailable: (retryAfterSeconds?: number) => JsonApiErrorDocument;
    /**
     * Builds a 504 Gateway Timeout error document.
     *
     * @returns JSON:API error document for gateway timeout.
     */
    gatewayTimeout: () => JsonApiErrorDocument;
};
/**
 * The JSON:API media type constant.
 */
export declare const JSONAPI_CONTENT_TYPE = "application/vnd.api+json";
//# sourceMappingURL=jsonapi.d.ts.map