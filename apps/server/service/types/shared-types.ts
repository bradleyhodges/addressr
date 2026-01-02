export type BulkIndexBody = Array<Record<string, unknown>>;
export type IndexableAddress = {
    links: { self: { href: string } };
    sla?: unknown;
    ssla?: unknown;
    confidence?: number;
    structurted: {
        structurted?: { confidence?: number };
        confidence?: number;
        [key: string]: unknown;
    };
};
