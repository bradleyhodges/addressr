import * as LinkHeader from "http-link-header";

/**
 * Represents a single address result from an OpenSearch query hit.
 * Contains the document source data stored in the index.
 */
export type AddressHitSource = {
    /** Single-line address representation */
    sla: string;
    /** Short single-line address (for unit/flat addresses) */
    ssla?: string;
    /** Structured address components */
    structured: Record<string, unknown>;
    /** Address confidence score from G-NAF */
    confidence?: number;
};

/**
 * Represents a single hit from an OpenSearch address search query.
 */
export type AddressSearchHit = {
    /** Document ID (address path) */
    _id: string;
    /** Relevance score from the search query */
    _score: number;
    /** The source document data */
    _source: AddressHitSource;
    /** Highlighted match fragments */
    highlight?: {
        sla?: string[];
        ssla?: string[];
    };
};

/**
 * A single address result in the API response format.
 */
export type AddressSearchResult = {
    /** Single-line address representation */
    sla: string;
    /** Relevance score from the search query */
    score: number;
    /** HATEOAS links for the address resource */
    links: {
        self: {
            href: string;
        };
    };
};

/**
 * Successful response from the getAddress function containing the address details.
 */
export type GetAddressSuccessResponse = {
    /** HTTP Link header for HATEOAS navigation */
    link: LinkHeader;
    /** Address data including structured components and SLA */
    json: Record<string, unknown> & { sla: string };
    /** MD5 hash of the address data for ETag support */
    hash: string;
};

/**
 * Error response from the getAddress function.
 */
export type GetAddressErrorResponse = {
    /** HTTP status code for the error */
    statusCode: number;
    /** Error details */
    json: { error: string };
};

/**
 * Union type for all possible getAddress responses.
 */
export type GetAddressResponse =
    | GetAddressSuccessResponse
    | GetAddressErrorResponse;

/**
 * Successful response from the getAddresses function containing the search results.
 */
export type GetAddressesSuccessResponse = {
    /** HTTP Link header for HATEOAS navigation and pagination */
    link: LinkHeader;
    /** Array of matching address results */
    json: AddressSearchResult[];
    /** HTTP Link-Template header for discoverable API templates */
    linkTemplate: LinkHeader;
};

/**
 * Error response from the getAddresses function.
 */
export type GetAddressesErrorResponse = {
    /** HTTP status code for the error */
    statusCode: number;
    /** Error details */
    json: { error: string };
};

/**
 * Union type for all possible getAddresses responses.
 */
export type GetAddressesResponse =
    | GetAddressesSuccessResponse
    | GetAddressesErrorResponse;

/**
 * Swagger/OpenAPI operation object for API documentation linkage.
 */
export type SwaggerOperation = {
    /** Operation ID for the API endpoint */
    operationId: string;
    /** Controller name for routing */
    "x-swagger-router-controller": string;
    /** Root relation type for HATEOAS */
    "x-root-rel"?: string;
    /** Operation summary for documentation */
    summary?: string;
    /** Operation parameters */
    parameters?: Array<{
        name: string;
        in: string;
        required?: boolean;
    }>;
};

/**
 * Swagger context object passed to getAddresses for API documentation linkage.
 */
export type SwaggerContext = {
    path: {
        get: SwaggerOperation;
    };
};

/**
 * OpenSearch error response body structure.
 */
export type OpensearchErrorBody = {
    /** Indicates if the document was found (for GET requests) */
    found?: boolean;
    /** Error details from OpenSearch */
    error?: {
        type: string;
        reason?: string;
    };
};

/**
 * OpenSearch error with additional metadata.
 */
export type OpensearchError = Error & {
    /** Error body from OpenSearch */
    body?: OpensearchErrorBody;
    /** Display name for timeout errors */
    displayName?: string;
};
