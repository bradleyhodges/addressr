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
 * Name of the OpenSearch index for storing locality documents.
 *
 * @default "addresskit-localities"
 * @env ES_LOCALITY_INDEX_NAME
 */
export const ES_LOCALITY_INDEX_NAME =
    process.env.ES_LOCALITY_INDEX_NAME ?? "addresskit-localities";

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
 * URL to the AddressKit G-NAF mirror configuration.
 * This CDN-powered mirror provides faster and more reliable downloads.
 * Falls back to data.gov.au if the mirror is unavailable.
 *
 * @default "https://dl.addresskit.com.au/package_show.conf.json"
 * @env GNAF_MIRROR_URL
 */
export const GNAF_MIRROR_URL =
    process.env.GNAF_MIRROR_URL ??
    "https://dl.addresskit.com.au/package_show.conf.json";

/**
 * URL to the G-NAF package metadata on data.gov.au.
 * Used as fallback when the mirror is unavailable.
 *
 * @default "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc"
 * @env GNAF_PACKAGE_URL
 */
export const GNAF_PACKAGE_URL =
    process.env.GNAF_PACKAGE_URL ??
    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc";

/**
 * Whether to use the AddressKit mirror as the primary download source.
 * When enabled, downloads are faster and more reliable via CDN.
 * Falls back to data.gov.au automatically if mirror is unavailable.
 *
 * @default true
 * @env GNAF_USE_MIRROR
 */
export const GNAF_USE_MIRROR = process.env.GNAF_USE_MIRROR !== "false";

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
 * @default 7234
 * @env PORT
 */
export const SERVER_PORT = Number.parseInt(process.env.PORT ?? "7234", 10);

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

// ---------------------------------------------------------------------------------
// Caching Configuration
// ---------------------------------------------------------------------------------

/**
 * Maximum number of entries in the search result cache.
 * Higher values improve hit rate but consume more memory.
 *
 * @default 1000
 * @env ADDRESSKIT_CACHE_MAX_ENTRIES
 */
export const CACHE_MAX_ENTRIES = Number.parseInt(
    process.env.ADDRESSKIT_CACHE_MAX_ENTRIES ?? "1000",
    10,
);

/**
 * TTL (Time-To-Live) for search cache entries in milliseconds.
 * Balance freshness with performance based on your data update frequency.
 *
 * @default 300000 (5 minutes)
 * @env ADDRESSKIT_CACHE_TTL_MS
 */
export const CACHE_TTL_MS = Number.parseInt(
    process.env.ADDRESSKIT_CACHE_TTL_MS ?? "300000",
    10,
);

/**
 * Whether to enable search result caching.
 * Disable for development or when debugging cache issues.
 *
 * @default true
 * @env ADDRESSKIT_CACHE_ENABLED
 */
export const CACHE_ENABLED = process.env.ADDRESSKIT_CACHE_ENABLED !== "false";

// ---------------------------------------------------------------------------------
// Circuit Breaker Configuration
// ---------------------------------------------------------------------------------

/**
 * Number of consecutive failures before the circuit opens.
 * Lower values provide faster failure detection but may trigger on transient issues.
 *
 * @default 5
 * @env ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD
 */
export const CIRCUIT_FAILURE_THRESHOLD = Number.parseInt(
    process.env.ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD ?? "5",
    10,
);

/**
 * Time in milliseconds before the circuit attempts to close after opening.
 * Gives the downstream service time to recover.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS
 */
export const CIRCUIT_RESET_TIMEOUT_MS = Number.parseInt(
    process.env.ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS ?? "30000",
    10,
);

/**
 * Number of successful requests required to close the circuit from half-open.
 * Ensures service is reliably recovered before resuming normal traffic.
 *
 * @default 3
 * @env ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD
 */
export const CIRCUIT_SUCCESS_THRESHOLD = Number.parseInt(
    process.env.ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD ?? "3",
    10,
);

// ---------------------------------------------------------------------------------
// Download Configuration
// ---------------------------------------------------------------------------------

/**
 * Maximum number of retry attempts for failed G-NAF downloads.
 * Network errors (ECONNRESET, timeout) will trigger automatic retries.
 *
 * @default 5
 * @env ADDRESSKIT_DOWNLOAD_MAX_RETRIES
 */
export const DOWNLOAD_MAX_RETRIES = Number.parseInt(
    process.env.ADDRESSKIT_DOWNLOAD_MAX_RETRIES ?? "5",
    10,
);

/**
 * Initial backoff delay in milliseconds before retrying failed downloads.
 * Used as the base delay for exponential backoff.
 *
 * @default 5000 (5 seconds)
 * @env ADDRESSKIT_DOWNLOAD_BACKOFF_INITIAL
 */
export const DOWNLOAD_BACKOFF_INITIAL = Number.parseInt(
    process.env.ADDRESSKIT_DOWNLOAD_BACKOFF_INITIAL ?? "5000",
    10,
);

/**
 * Maximum backoff delay in milliseconds between download retries.
 * Prevents backoff from growing indefinitely.
 *
 * @default 60000 (1 minute)
 * @env ADDRESSKIT_DOWNLOAD_BACKOFF_MAX
 */
export const DOWNLOAD_BACKOFF_MAX = Number.parseInt(
    process.env.ADDRESSKIT_DOWNLOAD_BACKOFF_MAX ?? "60000",
    10,
);

/**
 * Socket timeout in milliseconds for download connections.
 * If no data is received for this duration, the connection is reset.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_DOWNLOAD_SOCKET_TIMEOUT
 */
export const DOWNLOAD_SOCKET_TIMEOUT = Number.parseInt(
    process.env.ADDRESSKIT_DOWNLOAD_SOCKET_TIMEOUT ?? "30000",
    10,
);

/**
 * Connection timeout in milliseconds for establishing download connections.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_DOWNLOAD_CONNECT_TIMEOUT
 */
export const DOWNLOAD_CONNECT_TIMEOUT = Number.parseInt(
    process.env.ADDRESSKIT_DOWNLOAD_CONNECT_TIMEOUT ?? "30000",
    10,
);

// ---------------------------------------------------------------------------------
// Resource Management Configuration
// ---------------------------------------------------------------------------------

/**
 * Whether to enable dynamic resource-aware configuration.
 * When enabled, chunk sizes are calculated based on available system memory.
 *
 * @default true
 * @env ADDRESSKIT_DYNAMIC_RESOURCES
 */
export const DYNAMIC_RESOURCES_ENABLED =
    process.env.ADDRESSKIT_DYNAMIC_RESOURCES !== "false";

/**
 * Target memory utilization for resource calculations (0-1).
 * Lower values leave more headroom for other processes.
 *
 * @default 0.7 (70%)
 * @env ADDRESSKIT_TARGET_MEMORY_UTILIZATION
 */
export const TARGET_MEMORY_UTILIZATION = Number.parseFloat(
    process.env.ADDRESSKIT_TARGET_MEMORY_UTILIZATION ?? "0.7",
);

/**
 * Whether to enable verbose logging.
 *
 * @default false
 * @env VERBOSE
 */
export const VERBOSE = process.env.VERBOSE === "true";
