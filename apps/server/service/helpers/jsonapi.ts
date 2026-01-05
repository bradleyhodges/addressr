/**
 * JSON:API Response Builder Utilities
 *
 * Provides helper functions to construct JSON:API compliant response documents
 * for the AddressKit API. These utilities ensure consistent response formatting
 * across all endpoints.
 */

import type {
    AddressAutocompleteAttributes,
    AddressAutocompleteDocument,
    AddressDetailAttributes,
    AddressDetailDocument,
    JsonApiError,
    JsonApiErrorDocument,
    JsonApiImplementation,
    JsonApiLinks,
    JsonApiMeta,
    JsonApiResource,
    LocalityAutocompleteAttributes,
    LocalityAutocompleteDocument,
    LocalityDetailAttributes,
    LocalityDetailDocument,
} from "../types/jsonapi-types";

/**
 * Current JSON:API implementation information for AddressKit.
 */
const JSONAPI_IMPLEMENTATION: JsonApiImplementation = {
    version: "1.1",
};

/**
 * Resource type constants for consistent naming across the API.
 */
export const RESOURCE_TYPES = {
    /** Resource type for address entities */
    ADDRESS: "address",
    /** Resource type for autocomplete suggestions */
    ADDRESS_SUGGESTION: "address-suggestion",
    /** Resource type for locality entities */
    LOCALITY: "locality",
    /** Resource type for locality autocomplete suggestions */
    LOCALITY_SUGGESTION: "locality-suggestion",
} as const;

/**
 * Extracts the address ID from a full resource path.
 * Converts "/addresses/GANT_123456" to "GANT_123456".
 *
 * @param path - Full path including the resource prefix.
 * @returns The extracted address ID.
 */
export const extractAddressId = (path: string): string => {
    return path.replace(/^\/addresses\//, "");
};

/**
 * Extracts the locality ID from a full resource path.
 * Converts "/localities/NSW1234" to "NSW1234".
 *
 * @param path - Full path including the resource prefix.
 * @returns The extracted locality ID.
 */
export const extractLocalityId = (path: string): string => {
    return path.replace(/^\/localities\//, "");
};

/**
 * Builds a JSON:API resource object for an autocomplete suggestion.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param sla - Single-line address string for display.
 * @param rank - Search relevance score (0-1 normalized).
 * @param ssla - Optional short single-line address.
 * @returns A JSON:API resource object for the autocomplete result.
 */
export const buildAutocompleteResource = (
    id: string,
    sla: string,
    rank: number,
    ssla?: string,
): JsonApiResource<AddressAutocompleteAttributes> => {
    // Construct the attributes object with only defined values
    const attributes: AddressAutocompleteAttributes = {
        sla,
        rank,
        ...(ssla !== undefined && { ssla }),
    };

    return {
        type: RESOURCE_TYPES.ADDRESS_SUGGESTION,
        id,
        attributes,
        links: {
            self: `/addresses/${id}`,
        },
    };
};

/**
 * Builds a JSON:API resource object for a detailed address.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param attributes - Complete address attributes including structured data.
 * @returns A JSON:API resource object for the address.
 */
export const buildAddressResource = (
    id: string,
    attributes: AddressDetailAttributes,
): JsonApiResource<AddressDetailAttributes> => {
    return {
        type: RESOURCE_TYPES.ADDRESS,
        id,
        attributes,
        links: {
            self: `/addresses/${id}`,
        },
    };
};

/**
 * Builds a JSON:API resource object for a locality autocomplete suggestion.
 *
 * @param id - Unique identifier for the locality (G-NAF Locality PID).
 * @param display - Display string for the locality (e.g., "SYDNEY NSW 2000").
 * @param rank - Search relevance score (0-1 normalized).
 * @returns A JSON:API resource object for the locality autocomplete result.
 */
export const buildLocalityAutocompleteResource = (
    id: string,
    display: string,
    rank: number,
): JsonApiResource<LocalityAutocompleteAttributes> => {
    // Construct the attributes object
    const attributes: LocalityAutocompleteAttributes = {
        display,
        rank,
    };

    return {
        type: RESOURCE_TYPES.LOCALITY_SUGGESTION,
        id,
        attributes,
        links: {
            self: `/localities/${id}`,
        },
    };
};

/**
 * Builds a JSON:API resource object for a detailed locality.
 *
 * @param id - Unique identifier for the locality (G-NAF Locality PID).
 * @param attributes - Complete locality attributes including state and postcodes.
 * @returns A JSON:API resource object for the locality.
 */
export const buildLocalityResource = (
    id: string,
    attributes: LocalityDetailAttributes,
): JsonApiResource<LocalityDetailAttributes> => {
    return {
        type: RESOURCE_TYPES.LOCALITY,
        id,
        attributes,
        links: {
            self: `/localities/${id}`,
        },
    };
};

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
export const buildPaginationLinks = (
    baseUrl: string,
    query: string,
    currentPage: number,
    totalPages: number,
    pageSize?: number,
): JsonApiLinks => {
    // Helper to build query string with optional parameters
    const buildQueryString = (page?: number): string => {
        const params = new URLSearchParams();
        if (query) {
            params.set("q", query);
        }
        if (page !== undefined && page > 1) {
            params.set("page[number]", String(page));
        }
        if (pageSize !== undefined) {
            params.set("page[size]", String(pageSize));
        }
        const queryString = params.toString();
        return queryString ? `?${queryString}` : "";
    };

    const links: JsonApiLinks = {
        self: `${baseUrl}${buildQueryString(currentPage)}`,
        first: `${baseUrl}${buildQueryString(1)}`,
    };

    // Add previous link if not on first page
    if (currentPage > 1) {
        links.prev = `${baseUrl}${buildQueryString(currentPage - 1)}`;
    } else {
        links.prev = null;
    }

    // Add next link if more pages exist
    if (currentPage < totalPages) {
        links.next = `${baseUrl}${buildQueryString(currentPage + 1)}`;
    } else {
        links.next = null;
    }

    // Add last page link if we know the total
    if (totalPages > 0) {
        links.last = `${baseUrl}${buildQueryString(totalPages)}`;
    }

    return links;
};

/**
 * Warning message constants for API responses.
 */
export const API_WARNINGS = {
    /** Warning when the address dataset is empty (no addresses loaded) */
    EMPTY_DATASET:
        "No addresses are currently loaded in the dataset. Please run the data loader to populate the address index.",
    /** Warning when a search query returns no matching results */
    NO_RESULTS: "No addresses matched your search query.",
    /** Warning when the locality dataset is empty (no localities loaded) */
    EMPTY_LOCALITY_DATASET:
        "No localities are currently loaded in the dataset. Please run the data loader to populate the locality index.",
    /** Warning when a locality search query returns no matching results */
    NO_LOCALITY_RESULTS: "No localities matched your search query.",
} as const;

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
export const buildPaginationMeta = (
    total: number,
    page: number,
    pageSize: number,
    responseTime?: number,
    warning?: string,
): JsonApiMeta => {
    const totalPages = Math.ceil(total / pageSize);

    return {
        total,
        page,
        pageSize,
        totalPages,
        ...(responseTime !== undefined && { responseTime }),
        ...(warning !== undefined && { warning }),
    };
};

/**
 * Builds a complete JSON:API document for autocomplete responses.
 *
 * @param resources - Array of autocomplete resource objects.
 * @param links - Pagination and navigation links.
 * @param meta - Response metadata including pagination info.
 * @returns Complete JSON:API document for autocomplete results.
 */
export const buildAutocompleteDocument = (
    resources: JsonApiResource<AddressAutocompleteAttributes>[],
    links: JsonApiLinks,
    meta: JsonApiMeta,
): AddressAutocompleteDocument => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resources,
        links,
        meta,
    };
};

/**
 * Builds a complete JSON:API document for a single address detail response.
 *
 * @param resource - The address resource object.
 * @returns Complete JSON:API document for the address.
 */
export const buildAddressDetailDocument = (
    resource: JsonApiResource<AddressDetailAttributes>,
): AddressDetailDocument => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resource,
        links: {
            self: resource.links?.self,
        },
    };
};

/**
 * Builds a complete JSON:API document for locality autocomplete responses.
 *
 * @param resources - Array of locality autocomplete resource objects.
 * @param links - Pagination and navigation links.
 * @param meta - Response metadata including pagination info.
 * @returns Complete JSON:API document for locality autocomplete results.
 */
export const buildLocalityAutocompleteDocument = (
    resources: JsonApiResource<LocalityAutocompleteAttributes>[],
    links: JsonApiLinks,
    meta: JsonApiMeta,
): LocalityAutocompleteDocument => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resources,
        links,
        meta,
    };
};

/**
 * Builds a complete JSON:API document for a single locality detail response.
 *
 * @param resource - The locality resource object.
 * @returns Complete JSON:API document for the locality.
 */
export const buildLocalityDetailDocument = (
    resource: JsonApiResource<LocalityDetailAttributes>,
): LocalityDetailDocument => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resource,
        links: {
            self: resource.links?.self,
        },
    };
};

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
export const buildError = (
    status: string,
    title: string,
    detail?: string,
    code?: string,
    source?: JsonApiError["source"],
): JsonApiError => {
    return {
        status,
        title,
        ...(detail !== undefined && { detail }),
        ...(code !== undefined && { code }),
        ...(source !== undefined && { source }),
    };
};

/**
 * Builds a complete JSON:API error document.
 *
 * @param errors - Array of error objects.
 * @param meta - Optional document-level metadata.
 * @returns Complete JSON:API error document.
 */
export const buildErrorDocument = (
    errors: JsonApiError[],
    meta?: Record<string, unknown>,
): JsonApiErrorDocument => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        errors,
        ...(meta !== undefined && { meta }),
    };
};

/**
 * Common error document builders for standard HTTP errors.
 */
export const ErrorDocuments = {
    /**
     * Builds a 400 Bad Request error document.
     *
     * @param detail - Detailed explanation of what was invalid.
     * @param paramName - Optional parameter name that was invalid.
     * @returns JSON:API error document for bad request.
     */
    badRequest: (detail: string, paramName?: string): JsonApiErrorDocument => {
        return buildErrorDocument([
            buildError(
                "400",
                "Bad Request",
                detail,
                "INVALID_REQUEST",
                paramName ? { parameter: paramName } : undefined,
            ),
        ]);
    },

    /**
     * Builds a 400 Bad Request error document for missing required parameter.
     *
     * @param paramName - The name of the missing required parameter.
     * @returns JSON:API error document for missing parameter.
     */
    missingRequiredParameter: (paramName: string): JsonApiErrorDocument => {
        return buildErrorDocument([
            buildError(
                "400",
                "Bad Request",
                `The '${paramName}' query parameter is required and must not be empty.`,
                "MISSING_REQUIRED_PARAMETER",
                { parameter: paramName },
            ),
        ]);
    },

    /**
     * Builds a 404 Not Found error document.
     *
     * @param resourceType - Type of resource that was not found.
     * @param resourceId - ID of the resource that was not found.
     * @returns JSON:API error document for not found.
     */
    notFound: (
        resourceType: string,
        resourceId: string,
    ): JsonApiErrorDocument => {
        return buildErrorDocument([
            buildError(
                "404",
                "Not Found",
                `The ${resourceType} with ID '${resourceId}' does not exist.`,
                "RESOURCE_NOT_FOUND",
            ),
        ]);
    },

    /**
     * Builds a 500 Internal Server Error document.
     *
     * @param detail - Optional detail about the error (be careful not to leak internals).
     * @returns JSON:API error document for server error.
     */
    internalError: (detail?: string): JsonApiErrorDocument => {
        return buildErrorDocument([
            buildError(
                "500",
                "Internal Server Error",
                detail ??
                    "An unexpected error occurred while processing your request.",
                "INTERNAL_ERROR",
            ),
        ]);
    },

    /**
     * Builds a 503 Service Unavailable error document.
     *
     * @param retryAfterSeconds - Optional retry-after hint in seconds.
     * @returns JSON:API error document for service unavailable.
     */
    serviceUnavailable: (retryAfterSeconds?: number): JsonApiErrorDocument => {
        return buildErrorDocument(
            [
                buildError(
                    "503",
                    "Service Unavailable",
                    "The service is temporarily unavailable. Please try again later.",
                    "SERVICE_UNAVAILABLE",
                ),
            ],
            retryAfterSeconds !== undefined
                ? { retryAfter: retryAfterSeconds }
                : undefined,
        );
    },

    /**
     * Builds a 504 Gateway Timeout error document.
     *
     * @returns JSON:API error document for gateway timeout.
     */
    gatewayTimeout: (): JsonApiErrorDocument => {
        return buildErrorDocument([
            buildError(
                "504",
                "Gateway Timeout",
                "The upstream service did not respond in time.",
                "GATEWAY_TIMEOUT",
            ),
        ]);
    },
};

/**
 * The JSON:API media type constant.
 */
export const JSONAPI_CONTENT_TYPE = "application/vnd.api+json";
