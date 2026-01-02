export type BulkIndexBody = Array<Record<string, unknown>>;
/**
 * Represents an address document ready for indexing into OpenSearch.
 * Contains both the single-line address (SLA) and structured components.
 */
export type IndexableAddress = {
    /** HATEOAS self-link for the address resource */
    links: { self: { href: string } };
    /** Single-line address representation */
    sla?: unknown;
    /** Short single-line address (for unit/flat addresses) */
    ssla?: unknown;
    /** Address confidence score from G-NAF (0-2) */
    confidence?: number;
    /** Structured address components */
    structured: {
        /** Nested structured data (for backwards compatibility) */
        structured?: { confidence?: number };
        /** Confidence score at the structured level */
        confidence?: number;
        /** Additional structured address fields */
        [key: string]: unknown;
    };
};
