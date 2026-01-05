/**
 * JSON:API Specification v1.1 Type Definitions
 *
 * These types implement the JSON:API specification for consistent, standardized
 * API responses. See: https://jsonapi.org/format/
 */
/**
 * JSON:API document meta information.
 * Contains non-standard meta-information about the response.
 */
export type JsonApiMeta = {
    /** Total number of resources matching the query (for pagination) */
    total?: number;
    /** Current page number (1-indexed) */
    page?: number;
    /** Number of items per page */
    pageSize?: number;
    /** Total number of pages available */
    totalPages?: number;
    /** Query processing time in milliseconds */
    responseTime?: number;
    /** API version string */
    apiVersion?: string;
    /** Warning message for edge cases (e.g., empty dataset, no results) */
    warning?: string;
    /** Additional arbitrary metadata */
    [key: string]: unknown;
};
/**
 * JSON:API link object with optional metadata.
 */
export type JsonApiLinkObject = {
    /** The link URL */
    href: string;
    /** Relationship type of the link */
    rel?: string;
    /** Human-readable title for the link */
    title?: string;
    /** Media type of the linked resource */
    type?: string;
    /** Link-specific metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API links object containing navigation and resource links.
 * Links can be either a simple string URL or a link object.
 */
export type JsonApiLinks = {
    /** Link to the current resource/page */
    self?: string | JsonApiLinkObject;
    /** Link to the related resource */
    related?: string | JsonApiLinkObject;
    /** Link to the first page of results */
    first?: string | JsonApiLinkObject | null;
    /** Link to the last page of results */
    last?: string | JsonApiLinkObject | null;
    /** Link to the previous page of results */
    prev?: string | JsonApiLinkObject | null;
    /** Link to the next page of results */
    next?: string | JsonApiLinkObject | null;
    /** API documentation link */
    describedby?: string | JsonApiLinkObject;
    /** Additional links */
    [key: string]: string | JsonApiLinkObject | null | undefined;
};
/**
 * JSON:API resource identifier object for relationships.
 */
export type JsonApiResourceIdentifier = {
    /** Resource type identifier */
    type: string;
    /** Unique resource identifier */
    id: string;
    /** Optional metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API relationship object.
 */
export type JsonApiRelationship = {
    /** Links related to the relationship */
    links?: JsonApiLinks;
    /** Resource identifier or array of identifiers */
    data?: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
    /** Relationship metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API relationships object mapping relationship names to relationship objects.
 */
export type JsonApiRelationships = {
    [relationshipName: string]: JsonApiRelationship;
};
/**
 * JSON:API resource object representing a single entity.
 *
 * @template TAttributes - The type of the resource attributes
 */
export type JsonApiResource<TAttributes extends Record<string, unknown>> = {
    /** Resource type identifier */
    type: string;
    /** Unique resource identifier */
    id: string;
    /** Resource attributes (data fields) */
    attributes: TAttributes;
    /** Resource relationships to other resources */
    relationships?: JsonApiRelationships;
    /** Resource-specific links */
    links?: JsonApiLinks;
    /** Resource-specific metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API error source object indicating the source of an error.
 */
export type JsonApiErrorSource = {
    /** JSON Pointer to the value in request document that caused the error */
    pointer?: string;
    /** Name of the URI query parameter that caused the error */
    parameter?: string;
    /** Name of the header that caused the error */
    header?: string;
};
/**
 * JSON:API error object for standardized error responses.
 */
export type JsonApiError = {
    /** Unique identifier for this error occurrence */
    id?: string;
    /** Links object containing an "about" link with more details */
    links?: {
        about?: string | JsonApiLinkObject;
        type?: string | JsonApiLinkObject;
    };
    /** HTTP status code as a string */
    status?: string;
    /** Application-specific error code */
    code?: string;
    /** Short human-readable summary of the error */
    title?: string;
    /** Detailed human-readable explanation of the error */
    detail?: string;
    /** Object indicating the source of the error */
    source?: JsonApiErrorSource;
    /** Error-specific metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API implementation information object.
 */
export type JsonApiImplementation = {
    /** API implementation version */
    version?: string;
    /** Extensions supported by the implementation */
    ext?: string[];
    /** Profiles supported by the implementation */
    profile?: string[];
    /** Implementation metadata */
    meta?: Record<string, unknown>;
};
/**
 * JSON:API document structure for successful responses with data.
 *
 * @template TAttributes - The type of resource attributes
 */
export type JsonApiDocument<TAttributes extends Record<string, unknown>> = {
    /** JSON:API implementation information */
    jsonapi?: JsonApiImplementation;
    /** Primary data (single resource or array of resources) */
    data: JsonApiResource<TAttributes> | JsonApiResource<TAttributes>[];
    /** Included related resources (compound documents) */
    included?: JsonApiResource<Record<string, unknown>>[];
    /** Document-level links */
    links?: JsonApiLinks;
    /** Document-level metadata */
    meta?: JsonApiMeta;
};
/**
 * JSON:API document structure for error responses.
 */
export type JsonApiErrorDocument = {
    /** JSON:API implementation information */
    jsonapi?: JsonApiImplementation;
    /** Array of error objects */
    errors: JsonApiError[];
    /** Document-level links */
    links?: JsonApiLinks;
    /** Document-level metadata */
    meta?: Record<string, unknown>;
};
/**
 * Minimal address attributes returned by autocomplete endpoint.
 * Optimized for fast rendering of suggestions without full address data.
 */
export type AddressAutocompleteAttributes = {
    /** Single-line address for display in autocomplete dropdown */
    sla: string;
    /** Short single-line address (if available, for unit addresses) */
    ssla?: string;
    /** Relevance score from the search query (0-1 normalized) */
    rank: number;
};
/**
 * Geocode information for an address location (JSON:API response format).
 */
export type JsonApiAddressGeocode = {
    /** Geographic latitude coordinate */
    latitude: number;
    /** Geographic longitude coordinate */
    longitude: number;
    /** Whether this is the default geocode for the address */
    isDefault: boolean;
    /** Geocode reliability information */
    reliability?: {
        code: number;
        name: string;
    };
    /** Geocode type information */
    type?: {
        code: number;
        name: string;
    };
    /** Optional textual description (e.g., "REAR") */
    description?: string;
};
/**
 * Street component of a structured address.
 */
export type AddressStreet = {
    /** Street name */
    name?: string;
    /** Street type (e.g., "Avenue", "Street") */
    type?: {
        name?: string;
        code?: string;
    };
    /** Street suffix (e.g., "North", "Extension") */
    suffix?: {
        name?: string;
        code?: string;
    };
};
/**
 * Number range component for address numbering.
 */
export type AddressNumberRange = {
    /** Optional prefix (e.g., "RMB") */
    prefix?: string;
    /** The numeric portion */
    number?: number;
    /** Optional suffix (e.g., "A", "B") */
    suffix?: string;
};
/**
 * Address number component including optional range.
 */
export type AddressNumber = AddressNumberRange & {
    /** Last number in a range (for "10-12 Smith St" style addresses) */
    last?: AddressNumberRange;
};
/**
 * Flat/unit component of a structured address.
 */
export type AddressFlat = {
    /** Flat type (e.g., "Unit", "Apartment", "Suite") */
    type?: {
        name?: string;
        code?: string;
    };
    /** Flat number prefix */
    prefix?: string;
    /** Flat number */
    number?: number;
    /** Flat number suffix */
    suffix?: string;
};
/**
 * Level/floor component of a structured address.
 */
export type AddressLevel = {
    /** Level type (e.g., "Level", "Floor", "Ground") */
    type?: {
        name?: string;
        code?: string;
    };
    /** Level prefix */
    prefix?: string;
    /** Level number */
    number?: number;
    /** Level suffix */
    suffix?: string;
};
/**
 * Locality (suburb/town) component of an address.
 */
export type AddressLocality = {
    /** Locality name (suburb or town name) */
    name?: string;
    /** Locality classification */
    class?: {
        code?: string;
        name?: string;
    };
};
/**
 * Australian state/territory component.
 */
export type AddressState = {
    /** Full state name (e.g., "New South Wales") */
    name?: string;
    /** State abbreviation (e.g., "NSW") */
    abbreviation?: string;
};
/**
 * Lot number component for rural/unaddressed properties.
 */
export type AddressLotNumber = {
    /** Lot number prefix */
    prefix?: string;
    /** Lot number */
    number?: string;
    /** Lot number suffix */
    suffix?: string;
};
/**
 * Geocoding level information.
 */
export type AddressGeoLevel = {
    /** Binary indicator of geocoding level */
    code?: number;
    /** Descriptive name of geocode level */
    name?: string;
};
/**
 * Comprehensive structured address attributes for detailed lookups.
 * Contains all G-NAF address components in a parsed format.
 */
export type AddressDetailAttributes = {
    /** Persistent Identifier - unique G-NAF address ID */
    pid: string;
    /** Single-line address representation */
    sla: string;
    /** Short single-line address (for unit addresses: "12/34 Smith St") */
    ssla?: string;
    /** Multi-line address (array of 2-4 lines for labels) */
    mla?: string[];
    /** Short multi-line address */
    smla?: string[];
    /** Structured address components */
    structured: {
        /** Building or property name */
        buildingName?: string;
        /** Lot number (for rural properties) */
        lotNumber?: AddressLotNumber;
        /** Flat/unit details */
        flat?: AddressFlat;
        /** Level/floor details */
        level?: AddressLevel;
        /** Street number */
        number?: AddressNumber;
        /** Street details */
        street?: AddressStreet;
        /** Locality (suburb/town) */
        locality?: AddressLocality;
        /** State/territory */
        state?: AddressState;
        /** Postcode (4 digits for Australia) */
        postcode?: string;
        /** Address confidence score (0-2, higher = more confidence) */
        confidence?: number;
    };
    /** Geocoding information */
    geo?: {
        /** Geocoding level achieved */
        level?: AddressGeoLevel;
        /** Array of geocode points for this address */
        geocodes?: JsonApiAddressGeocode[];
    };
};
/**
 * JSON:API resource for autocomplete results.
 */
export type AddressAutocompleteResource = JsonApiResource<AddressAutocompleteAttributes>;
/**
 * JSON:API resource for detailed address information.
 */
export type AddressDetailResource = JsonApiResource<AddressDetailAttributes>;
/**
 * JSON:API document for autocomplete responses (array of minimal resources).
 */
export type AddressAutocompleteDocument = JsonApiDocument<AddressAutocompleteAttributes>;
/**
 * JSON:API document for single address detail responses.
 */
export type AddressDetailDocument = JsonApiDocument<AddressDetailAttributes>;
/**
 * Minimal locality attributes returned by autocomplete endpoint.
 * Optimized for fast rendering of suburb/postcode suggestions.
 */
export type LocalityAutocompleteAttributes = {
    /** Display name for the locality (e.g., "SYDNEY NSW 2000") */
    display: string;
    /** Relevance score from the search query (0-1 normalized) */
    rank: number;
};
/**
 * Comprehensive locality attributes for detailed lookups.
 * Contains full locality information from G-NAF.
 */
export type LocalityDetailAttributes = {
    /** G-NAF Locality Persistent Identifier */
    localityPid: string;
    /** Locality name (suburb or town name) */
    name: string;
    /** Display name including state and postcode (e.g., "SYDNEY NSW 2000") */
    display: string;
    /** Locality classification */
    class?: {
        code?: string;
        name?: string;
    };
    /** State/territory information */
    state?: {
        name?: string;
        abbreviation?: string;
    };
    /** Primary postcode for this locality (if available) */
    postcode?: string;
    /** All postcodes associated with this locality */
    postcodes?: string[];
};
/**
 * JSON:API resource for locality autocomplete results.
 */
export type LocalityAutocompleteResource = JsonApiResource<LocalityAutocompleteAttributes>;
/**
 * JSON:API resource for detailed locality information.
 */
export type LocalityDetailResource = JsonApiResource<LocalityDetailAttributes>;
/**
 * JSON:API document for locality autocomplete responses (array of minimal resources).
 */
export type LocalityAutocompleteDocument = JsonApiDocument<LocalityAutocompleteAttributes>;
/**
 * JSON:API document for single locality detail responses.
 */
export type LocalityDetailDocument = JsonApiDocument<LocalityDetailAttributes>;
//# sourceMappingURL=jsonapi-types.d.ts.map