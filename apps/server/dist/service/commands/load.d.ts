import type * as Types from "../types/index";
/**
 * Custom error class for indexing failures with context about retry attempts.
 *
 * This error includes detailed information about the failure to aid debugging
 * and provides context for monitoring and alerting systems.
 */
export declare class IndexingError extends Error {
    /** Number of retry attempts made before giving up */
    readonly attempts: number;
    /** The underlying error or response that caused the failure */
    readonly cause: unknown;
    /** Number of documents that failed to index */
    readonly documentCount: number;
    /**
     * Creates a new IndexingError.
     *
     * @param message - Human-readable error description.
     * @param attempts - Number of retry attempts made.
     * @param cause - The underlying error or failed response.
     * @param documentCount - Number of documents in the failed batch.
     */
    constructor(message: string, attempts: number, cause: unknown, documentCount?: number);
}
/**
 * Sends a bulk indexing request to OpenSearch with exponential backoff and bounded retries.
 *
 * This function implements a robust retry strategy for bulk indexing operations:
 * - Exponential backoff starting from INDEX_BACKOFF_INITIAL
 * - Linear increment added after each retry (INDEX_BACKOFF_INCREMENT)
 * - Maximum backoff capped at INDEX_BACKOFF_MAX
 * - Maximum retry count capped at INDEX_MAX_RETRIES (0 = unlimited, not recommended)
 * - Detailed error extraction for debugging failed documents
 * - Memory pressure awareness for adaptive throttling
 *
 * @alias sendIndexRequest
 *
 * @param indexingBody - Array of index operations and documents to bulk index.
 * @param initialBackoff - Initial backoff delay in ms (defaults to INDEX_BACKOFF_INITIAL).
 * @param options - Additional options for the indexing request.
 * @param options.refresh - Whether to refresh the index after indexing (default: false).
 *
 * @returns A promise that resolves when the index request succeeds.
 * @throws {IndexingError} If all retry attempts are exhausted without success.
 */
export declare const sendIndexRequest: (indexingBody: Types.BulkIndexBody, initialBackoff?: number, { refresh }?: {
    refresh?: boolean;
}) => Promise<void>;
/**
 * Main entry point for loading G-NAF data into the address search index.
 *
 * This function orchestrates the entire GNAF loading workflow:
 * 1. Fetches the latest G-NAF ZIP file from data.gov.au (or uses cached copy)
 * 2. Extracts the ZIP file to a local directory
 * 3. Locates the G-NAF data directory within the extracted contents
 * 4. Loads all data files into the OpenSearch index
 *
 * The loading process respects the COVERED_STATES environment variable to
 * optionally limit which states are processed. When dynamic resources are
 * enabled, the loader adapts to available system memory for optimal performance.
 *
 * @alias loadGnaf
 *
 * @param options - Optional loading configuration
 * @param options.refresh - Whether to refresh the index after loading (default: false)
 *
 * @returns A promise that resolves when all data is loaded
 * @throws {Error} If the G-NAF data cannot be downloaded, extracted, or loaded
 */
export declare const loadCommandEntry: ({ refresh, }?: {
    refresh?: boolean;
}) => Promise<void>;
//# sourceMappingURL=load.d.ts.map