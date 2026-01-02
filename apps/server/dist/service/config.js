"use strict";
/**
 * Centralized configuration module for the AddressKit service.
 *
 * This module parses all environment variables once at startup to avoid
 * repeated parsing during request handling and bulk loading operations.
 * All configuration values are validated and provide sensible defaults.
 *
 * @module config
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TARGET_MEMORY_UTILIZATION = exports.DYNAMIC_RESOURCES_ENABLED = exports.CIRCUIT_SUCCESS_THRESHOLD = exports.CIRCUIT_RESET_TIMEOUT_MS = exports.CIRCUIT_FAILURE_THRESHOLD = exports.CACHE_ENABLED = exports.CACHE_TTL_MS = exports.CACHE_MAX_ENTRIES = exports.CORS_ALLOW_HEADERS = exports.CORS_EXPOSE_HEADERS = exports.CORS_ALLOW_ORIGIN = exports.SERVER_PORT = exports.THIRTY_DAYS_MS = exports.ONE_DAY_MS = exports.ONE_DAY_S = exports.GNAF_DIR = exports.GNAF_PACKAGE_URL = exports.ENABLE_GEO = exports.LOADING_CHUNK_SIZE = exports.INDEX_TIMEOUT = exports.INDEX_MAX_RETRIES = exports.INDEX_BACKOFF_MAX = exports.INDEX_BACKOFF_INCREMENT = exports.INDEX_BACKOFF_INITIAL = exports.ES_CLEAR_INDEX = exports.ES_INDEX_NAME = exports.MAX_PAGE_NUMBER = exports.MAX_PAGE_SIZE = exports.PAGE_SIZE = void 0;
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
exports.PAGE_SIZE = Number.parseInt(process.env.PAGE_SIZE ?? "8", 10) || 8;
/**
 * Maximum allowed page size to prevent excessive memory usage.
 * Requests for larger page sizes will be clamped to this value.
 *
 * @default 100
 * @env MAX_PAGE_SIZE
 */
exports.MAX_PAGE_SIZE = Number.parseInt(process.env.MAX_PAGE_SIZE ?? "100", 10) || 100;
/**
 * Maximum page number allowed for pagination.
 * Prevents deep pagination that can strain OpenSearch.
 *
 * @default 1000
 * @env MAX_PAGE_NUMBER
 */
exports.MAX_PAGE_NUMBER = Number.parseInt(process.env.MAX_PAGE_NUMBER ?? "1000", 10) || 1000;
// ---------------------------------------------------------------------------------
// OpenSearch/Elasticsearch Configuration
// ---------------------------------------------------------------------------------
/**
 * Name of the OpenSearch index for storing address documents.
 *
 * @default "addresskit"
 * @env ES_INDEX_NAME
 */
exports.ES_INDEX_NAME = process.env.ES_INDEX_NAME ?? "addresskit";
/**
 * Whether to clear and recreate the index on startup.
 * Setting this to true will delete all existing address data!
 *
 * @default false
 * @env ES_CLEAR_INDEX
 */
exports.ES_CLEAR_INDEX = process.env.ES_CLEAR_INDEX === "true";
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
exports.INDEX_BACKOFF_INITIAL = Number.parseInt(process.env.ADDRESSKIT_INDEX_BACKOFF ?? "30000", 10);
/**
 * Increment added to backoff delay after each failed retry attempt.
 * Provides linear growth on top of the initial backoff.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_INDEX_BACKOFF_INCREMENT
 */
exports.INDEX_BACKOFF_INCREMENT = Number.parseInt(process.env.ADDRESSKIT_INDEX_BACKOFF_INCREMENT ?? "30000", 10);
/**
 * Maximum backoff delay in milliseconds.
 * Prevents backoff from growing indefinitely.
 *
 * @default 600000 (10 minutes)
 * @env ADDRESSKIT_INDEX_BACKOFF_MAX
 */
exports.INDEX_BACKOFF_MAX = Number.parseInt(process.env.ADDRESSKIT_INDEX_BACKOFF_MAX ?? "600000", 10);
/**
 * Maximum number of retry attempts for failed index requests.
 * After this many failures, the operation will throw an error.
 * Set to 0 for unlimited retries (not recommended for production).
 *
 * @default 10
 * @env ADDRESSKIT_INDEX_MAX_RETRIES
 */
exports.INDEX_MAX_RETRIES = Number.parseInt(process.env.ADDRESSKIT_INDEX_MAX_RETRIES ?? "10", 10);
/**
 * Timeout for individual bulk indexing requests.
 * OpenSearch may need significant time for large batches.
 *
 * @default "300s" (5 minutes)
 * @env ADDRESSKIT_INDEX_TIMEOUT
 */
exports.INDEX_TIMEOUT = process.env.ADDRESSKIT_INDEX_TIMEOUT ?? "300s";
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
exports.LOADING_CHUNK_SIZE = Number.parseInt(process.env.ADDRESSKIT_LOADING_CHUNK_SIZE ?? "10", 10);
/**
 * Whether to enable geocoding data loading.
 * Geocodes add latitude/longitude but increase index size significantly.
 *
 * @default false
 * @env ADDRESSKIT_ENABLE_GEO
 */
exports.ENABLE_GEO = !!process.env.ADDRESSKIT_ENABLE_GEO;
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
exports.GNAF_PACKAGE_URL = process.env.GNAF_PACKAGE_URL ??
    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc";
/**
 * Local directory for storing downloaded G-NAF data files.
 *
 * @default "target/gnaf"
 * @env GNAF_DIR
 */
exports.GNAF_DIR = process.env.GNAF_DIR ?? "target/gnaf";
// ---------------------------------------------------------------------------------
// Time Constants (not configurable)
// ---------------------------------------------------------------------------------
/**
 * Number of seconds in a day.
 */
exports.ONE_DAY_S = 86400;
/**
 * Number of milliseconds in a day.
 */
exports.ONE_DAY_MS = 1000 * exports.ONE_DAY_S;
/**
 * Number of milliseconds in 30 days.
 * Used for stale cache threshold.
 */
exports.THIRTY_DAYS_MS = exports.ONE_DAY_MS * 30;
// ---------------------------------------------------------------------------------
// Server Configuration
// ---------------------------------------------------------------------------------
/**
 * HTTP port for the API server.
 *
 * @default 8080
 * @env PORT
 */
exports.SERVER_PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
/**
 * CORS Access-Control-Allow-Origin header value.
 * Set to "*" to allow all origins, or a specific domain.
 *
 * @default undefined (no CORS header)
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN
 */
exports.CORS_ALLOW_ORIGIN = process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN;
/**
 * CORS Access-Control-Expose-Headers header value.
 * Comma-separated list of headers to expose to the client.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS
 */
exports.CORS_EXPOSE_HEADERS = process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS;
/**
 * CORS Access-Control-Allow-Headers header value.
 * Comma-separated list of headers allowed in requests.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS
 */
exports.CORS_ALLOW_HEADERS = process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS;
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
exports.CACHE_MAX_ENTRIES = Number.parseInt(process.env.ADDRESSKIT_CACHE_MAX_ENTRIES ?? "1000", 10);
/**
 * TTL (Time-To-Live) for search cache entries in milliseconds.
 * Balance freshness with performance based on your data update frequency.
 *
 * @default 300000 (5 minutes)
 * @env ADDRESSKIT_CACHE_TTL_MS
 */
exports.CACHE_TTL_MS = Number.parseInt(process.env.ADDRESSKIT_CACHE_TTL_MS ?? "300000", 10);
/**
 * Whether to enable search result caching.
 * Disable for development or when debugging cache issues.
 *
 * @default true
 * @env ADDRESSKIT_CACHE_ENABLED
 */
exports.CACHE_ENABLED = process.env.ADDRESSKIT_CACHE_ENABLED !== "false";
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
exports.CIRCUIT_FAILURE_THRESHOLD = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD ?? "5", 10);
/**
 * Time in milliseconds before the circuit attempts to close after opening.
 * Gives the downstream service time to recover.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS
 */
exports.CIRCUIT_RESET_TIMEOUT_MS = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS ?? "30000", 10);
/**
 * Number of successful requests required to close the circuit from half-open.
 * Ensures service is reliably recovered before resuming normal traffic.
 *
 * @default 3
 * @env ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD
 */
exports.CIRCUIT_SUCCESS_THRESHOLD = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD ?? "3", 10);
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
exports.DYNAMIC_RESOURCES_ENABLED = process.env.ADDRESSKIT_DYNAMIC_RESOURCES !== "false";
/**
 * Target memory utilization for resource calculations (0-1).
 * Lower values leave more headroom for other processes.
 *
 * @default 0.7 (70%)
 * @env ADDRESSKIT_TARGET_MEMORY_UTILIZATION
 */
exports.TARGET_MEMORY_UTILIZATION = Number.parseFloat(process.env.ADDRESSKIT_TARGET_MEMORY_UTILIZATION ?? "0.7");
//# sourceMappingURL=config.js.map