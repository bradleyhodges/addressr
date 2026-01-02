/**
 * Centralized configuration module for the AddressKit service.
 *
 * This module parses all environment variables once at startup to avoid
 * repeated parsing during request handling and bulk loading operations.
 * All configuration values are validated and provide sensible defaults.
 *
 * @module config
 */

// ---------------------------------------------------------------------------------
// Pagination Configuration
// ---------------------------------------------------------------------------------

/**
 * Default page size for paginated search results.
 * Controls how many address results are returned per page.
 *
 * @default 8
 * @env PAGE_SIZE
 */
export const PAGE_SIZE = Number.parseInt(process.env.PAGE_SIZE ?? "8", 10) || 8;

/**
 * Maximum allowed page size to prevent excessive memory usage.
 * Requests for larger page sizes will be clamped to this value.
 *
 * @default 100
 * @env MAX_PAGE_SIZE
 */
export const MAX_PAGE_SIZE =
    Number.parseInt(process.env.MAX_PAGE_SIZE ?? "100", 10) || 100;

/**
 * Maximum page number allowed for pagination.
 * Prevents deep pagination that can strain OpenSearch.
 *
 * @default 1000
 * @env MAX_PAGE_NUMBER
 */
export const MAX_PAGE_NUMBER =
    Number.parseInt(process.env.MAX_PAGE_NUMBER ?? "1000", 10) || 1000;

// ---------------------------------------------------------------------------------
// OpenSearch/Elasticsearch Configuration
// ---------------------------------------------------------------------------------

/**
 * Name of the OpenSearch index for storing address documents.
 *
 * @default "addresskit"
 * @env ES_INDEX_NAME
 */
export const ES_INDEX_NAME = process.env.ES_INDEX_NAME ?? "addresskit";

/**
 * Whether to clear and recreate the index on startup.
 * Setting this to true will delete all existing address data!
 *
 * @default false
 * @env ES_CLEAR_INDEX
 */
export const ES_CLEAR_INDEX = process.env.ES_CLEAR_INDEX === "true";

// ---------------------------------------------------------------------------------
// Indexing Retry Configuration
// ---------------------------------------------------------------------------------

/**
 * Initial backoff delay in milliseconds before retrying failed index requests.
 * Used as the base delay for exponential backoff.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_INDEX_BACKOFF
 */
export const INDEX_BACKOFF_INITIAL = Number.parseInt(
    process.env.ADDRESSKIT_INDEX_BACKOFF ?? "30000",
    10,
);

/**
 * Increment added to backoff delay after each failed retry attempt.
 * Provides linear growth on top of the initial backoff.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_INDEX_BACKOFF_INCREMENT
 */
export const INDEX_BACKOFF_INCREMENT = Number.parseInt(
    process.env.ADDRESSKIT_INDEX_BACKOFF_INCREMENT ?? "30000",
    10,
);

/**
 * Maximum backoff delay in milliseconds.
 * Prevents backoff from growing indefinitely.
 *
 * @default 600000 (10 minutes)
 * @env ADDRESSKIT_INDEX_BACKOFF_MAX
 */
export const INDEX_BACKOFF_MAX = Number.parseInt(
    process.env.ADDRESSKIT_INDEX_BACKOFF_MAX ?? "600000",
    10,
);

/**
 * Maximum number of retry attempts for failed index requests.
 * After this many failures, the operation will throw an error.
 * Set to 0 for unlimited retries (not recommended for production).
 *
 * @default 10
 * @env ADDRESSKIT_INDEX_MAX_RETRIES
 */
export const INDEX_MAX_RETRIES = Number.parseInt(
    process.env.ADDRESSKIT_INDEX_MAX_RETRIES ?? "10",
    10,
);

/**
 * Timeout for individual bulk indexing requests.
 * OpenSearch may need significant time for large batches.
 *
 * @default "300s" (5 minutes)
 * @env ADDRESSKIT_INDEX_TIMEOUT
 */
export const INDEX_TIMEOUT = process.env.ADDRESSKIT_INDEX_TIMEOUT ?? "300s";

// ---------------------------------------------------------------------------------
// Data Loading Configuration
// ---------------------------------------------------------------------------------

/**
 * Chunk size in megabytes for parsing G-NAF address files.
 * Larger chunks use more memory but may be faster.
 *
 * @default 10 (MB)
 * @env ADDRESSKIT_LOADING_CHUNK_SIZE
 */
export const LOADING_CHUNK_SIZE = Number.parseInt(
    process.env.ADDRESSKIT_LOADING_CHUNK_SIZE ?? "10",
    10,
);

/**
 * Whether to enable geocoding data loading.
 * Geocodes add latitude/longitude but increase index size significantly.
 *
 * @default false
 * @env ADDRESSKIT_ENABLE_GEO
 */
export const ENABLE_GEO = !!process.env.ADDRESSKIT_ENABLE_GEO;

// ---------------------------------------------------------------------------------
// G-NAF Source Configuration
// ---------------------------------------------------------------------------------

/**
 * URL to the G-NAF package metadata on data.gov.au.
 * Used to discover the latest G-NAF download URL.
 *
 * @default "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc"
 * @env GNAF_PACKAGE_URL
 */
export const GNAF_PACKAGE_URL =
    process.env.GNAF_PACKAGE_URL ??
    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc";

/**
 * Local directory for storing downloaded G-NAF data files.
 *
 * @default "target/gnaf"
 * @env GNAF_DIR
 */
export const GNAF_DIR = process.env.GNAF_DIR ?? "target/gnaf";

// ---------------------------------------------------------------------------------
// Time Constants (not configurable)
// ---------------------------------------------------------------------------------

/**
 * Number of seconds in a day.
 */
export const ONE_DAY_S = 86400;

/**
 * Number of milliseconds in a day.
 */
export const ONE_DAY_MS = 1000 * ONE_DAY_S;

/**
 * Number of milliseconds in 30 days.
 * Used for stale cache threshold.
 */
export const THIRTY_DAYS_MS = ONE_DAY_MS * 30;

// ---------------------------------------------------------------------------------
// Server Configuration
// ---------------------------------------------------------------------------------

/**
 * HTTP port for the API server.
 *
 * @default 8080
 * @env PORT
 */
export const SERVER_PORT = Number.parseInt(process.env.PORT ?? "8080", 10);

/**
 * CORS Access-Control-Allow-Origin header value.
 * Set to "*" to allow all origins, or a specific domain.
 *
 * @default undefined (no CORS header)
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN
 */
export const CORS_ALLOW_ORIGIN =
    process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN;

/**
 * CORS Access-Control-Expose-Headers header value.
 * Comma-separated list of headers to expose to the client.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS
 */
export const CORS_EXPOSE_HEADERS =
    process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS;

/**
 * CORS Access-Control-Allow-Headers header value.
 * Comma-separated list of headers allowed in requests.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS
 */
export const CORS_ALLOW_HEADERS =
    process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS;
