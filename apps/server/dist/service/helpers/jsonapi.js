"use strict";
/**
 * JSON:API Response Builder Utilities
 *
 * Provides helper functions to construct JSON:API compliant response documents
 * for the AddressKit API. These utilities ensure consistent response formatting
 * across all endpoints.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONAPI_CONTENT_TYPE = exports.ErrorDocuments = exports.buildErrorDocument = exports.buildError = exports.buildAddressDetailDocument = exports.buildAutocompleteDocument = exports.buildPaginationMeta = exports.API_WARNINGS = exports.buildPaginationLinks = exports.buildAddressResource = exports.buildAutocompleteResource = exports.extractAddressId = exports.RESOURCE_TYPES = void 0;
/**
 * Current JSON:API implementation information for AddressKit.
 */
const JSONAPI_IMPLEMENTATION = {
    version: "1.1",
};
/**
 * Resource type constants for consistent naming across the API.
 */
exports.RESOURCE_TYPES = {
    /** Resource type for address entities */
    ADDRESS: "address",
    /** Resource type for autocomplete suggestions */
    ADDRESS_SUGGESTION: "address-suggestion",
};
/**
 * Extracts the address ID from a full resource path.
 * Converts "/addresses/GANT_123456" to "GANT_123456".
 *
 * @param path - Full path including the resource prefix.
 * @returns The extracted address ID.
 */
const extractAddressId = (path) => {
    return path.replace(/^\/addresses\//, "");
};
exports.extractAddressId = extractAddressId;
/**
 * Builds a JSON:API resource object for an autocomplete suggestion.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param sla - Single-line address string for display.
 * @param rank - Search relevance score (0-1 normalized).
 * @param ssla - Optional short single-line address.
 * @returns A JSON:API resource object for the autocomplete result.
 */
const buildAutocompleteResource = (id, sla, rank, ssla) => {
    // Construct the attributes object with only defined values
    const attributes = {
        sla,
        rank,
        ...(ssla !== undefined && { ssla }),
    };
    return {
        type: exports.RESOURCE_TYPES.ADDRESS_SUGGESTION,
        id,
        attributes,
        links: {
            self: `/addresses/${id}`,
        },
    };
};
exports.buildAutocompleteResource = buildAutocompleteResource;
/**
 * Builds a JSON:API resource object for a detailed address.
 *
 * @param id - Unique identifier for the address (G-NAF PID).
 * @param attributes - Complete address attributes including structured data.
 * @returns A JSON:API resource object for the address.
 */
const buildAddressResource = (id, attributes) => {
    return {
        type: exports.RESOURCE_TYPES.ADDRESS,
        id,
        attributes,
        links: {
            self: `/addresses/${id}`,
        },
    };
};
exports.buildAddressResource = buildAddressResource;
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
const buildPaginationLinks = (baseUrl, query, currentPage, totalPages, pageSize) => {
    // Helper to build query string with optional parameters
    const buildQueryString = (page) => {
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
    const links = {
        self: `${baseUrl}${buildQueryString(currentPage)}`,
        first: `${baseUrl}${buildQueryString(1)}`,
    };
    // Add previous link if not on first page
    if (currentPage > 1) {
        links.prev = `${baseUrl}${buildQueryString(currentPage - 1)}`;
    }
    else {
        links.prev = null;
    }
    // Add next link if more pages exist
    if (currentPage < totalPages) {
        links.next = `${baseUrl}${buildQueryString(currentPage + 1)}`;
    }
    else {
        links.next = null;
    }
    // Add last page link if we know the total
    if (totalPages > 0) {
        links.last = `${baseUrl}${buildQueryString(totalPages)}`;
    }
    return links;
};
exports.buildPaginationLinks = buildPaginationLinks;
/**
 * Warning message constants for API responses.
 */
exports.API_WARNINGS = {
    /** Warning when the address dataset is empty (no addresses loaded) */
    EMPTY_DATASET: "No addresses are currently loaded in the dataset. Please run the data loader to populate the address index.",
    /** Warning when a search query returns no matching results */
    NO_RESULTS: "No addresses matched your search query.",
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
const buildPaginationMeta = (total, page, pageSize, responseTime, warning) => {
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
exports.buildPaginationMeta = buildPaginationMeta;
/**
 * Builds a complete JSON:API document for autocomplete responses.
 *
 * @param resources - Array of autocomplete resource objects.
 * @param links - Pagination and navigation links.
 * @param meta - Response metadata including pagination info.
 * @returns Complete JSON:API document for autocomplete results.
 */
const buildAutocompleteDocument = (resources, links, meta) => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resources,
        links,
        meta,
    };
};
exports.buildAutocompleteDocument = buildAutocompleteDocument;
/**
 * Builds a complete JSON:API document for a single address detail response.
 *
 * @param resource - The address resource object.
 * @returns Complete JSON:API document for the address.
 */
const buildAddressDetailDocument = (resource) => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        data: resource,
        links: {
            self: resource.links?.self,
        },
    };
};
exports.buildAddressDetailDocument = buildAddressDetailDocument;
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
const buildError = (status, title, detail, code, source) => {
    return {
        status,
        title,
        ...(detail !== undefined && { detail }),
        ...(code !== undefined && { code }),
        ...(source !== undefined && { source }),
    };
};
exports.buildError = buildError;
/**
 * Builds a complete JSON:API error document.
 *
 * @param errors - Array of error objects.
 * @param meta - Optional document-level metadata.
 * @returns Complete JSON:API error document.
 */
const buildErrorDocument = (errors, meta) => {
    return {
        jsonapi: JSONAPI_IMPLEMENTATION,
        errors,
        ...(meta !== undefined && { meta }),
    };
};
exports.buildErrorDocument = buildErrorDocument;
/**
 * Common error document builders for standard HTTP errors.
 */
exports.ErrorDocuments = {
    /**
     * Builds a 400 Bad Request error document.
     *
     * @param detail - Detailed explanation of what was invalid.
     * @param paramName - Optional parameter name that was invalid.
     * @returns JSON:API error document for bad request.
     */
    badRequest: (detail, paramName) => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("400", "Bad Request", detail, "INVALID_REQUEST", paramName ? { parameter: paramName } : undefined),
        ]);
    },
    /**
     * Builds a 400 Bad Request error document for missing required parameter.
     *
     * @param paramName - The name of the missing required parameter.
     * @returns JSON:API error document for missing parameter.
     */
    missingRequiredParameter: (paramName) => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("400", "Bad Request", `The '${paramName}' query parameter is required and must not be empty.`, "MISSING_REQUIRED_PARAMETER", { parameter: paramName }),
        ]);
    },
    /**
     * Builds a 404 Not Found error document.
     *
     * @param resourceType - Type of resource that was not found.
     * @param resourceId - ID of the resource that was not found.
     * @returns JSON:API error document for not found.
     */
    notFound: (resourceType, resourceId) => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("404", "Not Found", `The ${resourceType} with ID '${resourceId}' does not exist.`, "RESOURCE_NOT_FOUND"),
        ]);
    },
    /**
     * Builds a 500 Internal Server Error document.
     *
     * @param detail - Optional detail about the error (be careful not to leak internals).
     * @returns JSON:API error document for server error.
     */
    internalError: (detail) => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("500", "Internal Server Error", detail ??
                "An unexpected error occurred while processing your request.", "INTERNAL_ERROR"),
        ]);
    },
    /**
     * Builds a 503 Service Unavailable error document.
     *
     * @param retryAfterSeconds - Optional retry-after hint in seconds.
     * @returns JSON:API error document for service unavailable.
     */
    serviceUnavailable: (retryAfterSeconds) => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("503", "Service Unavailable", "The service is temporarily unavailable. Please try again later.", "SERVICE_UNAVAILABLE"),
        ], retryAfterSeconds !== undefined
            ? { retryAfter: retryAfterSeconds }
            : undefined);
    },
    /**
     * Builds a 504 Gateway Timeout error document.
     *
     * @returns JSON:API error document for gateway timeout.
     */
    gatewayTimeout: () => {
        return (0, exports.buildErrorDocument)([
            (0, exports.buildError)("504", "Gateway Timeout", "The upstream service did not respond in time.", "GATEWAY_TIMEOUT"),
        ]);
    },
};
/**
 * The JSON:API media type constant.
 */
exports.JSONAPI_CONTENT_TYPE = "application/vnd.api+json";
//# sourceMappingURL=jsonapi.js.map