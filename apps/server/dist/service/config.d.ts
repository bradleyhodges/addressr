/**
 * Centralized configuration module for the AddressKit service.
 *
 * This module parses all environment variables once at startup to avoid
 * repeated parsing during request handling and bulk loading operations.
 * All configuration values are validated and provide sensible defaults.
 *
 * @module config
 */
/**
 * Default page size for paginated search results.
 * Controls how many address results are returned per page.
 *
 * @default 8
 * @env PAGE_SIZE
 */
export declare const PAGE_SIZE: number;
/**
 * Maximum allowed page size to prevent excessive memory usage.
 * Requests for larger page sizes will be clamped to this value.
 *
 * @default 100
 * @env MAX_PAGE_SIZE
 */
export declare const MAX_PAGE_SIZE: number;
/**
 * Maximum page number allowed for pagination.
 * Prevents deep pagination that can strain OpenSearch.
 *
 * @default 1000
 * @env MAX_PAGE_NUMBER
 */
export declare const MAX_PAGE_NUMBER: number;
/**
 * Name of the OpenSearch index for storing address documents.
 *
 * @default "addresskit"
 * @env ES_INDEX_NAME
 */
export declare const ES_INDEX_NAME: string;
/**
 * Name of the OpenSearch index for storing locality documents.
 *
 * @default "addresskit-localities"
 * @env ES_LOCALITY_INDEX_NAME
 */
export declare const ES_LOCALITY_INDEX_NAME: string;
/**
 * Whether to clear and recreate the index on startup.
 * Setting this to true will delete all existing address data!
 *
 * @default false
 * @env ES_CLEAR_INDEX
 */
export declare const ES_CLEAR_INDEX: boolean;
/**
 * Initial backoff delay in milliseconds before retrying failed index requests.
 * Used as the base delay for exponential backoff.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_INDEX_BACKOFF
 */
export declare const INDEX_BACKOFF_INITIAL: number;
/**
 * Increment added to backoff delay after each failed retry attempt.
 * Provides linear growth on top of the initial backoff.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_INDEX_BACKOFF_INCREMENT
 */
export declare const INDEX_BACKOFF_INCREMENT: number;
/**
 * Maximum backoff delay in milliseconds.
 * Prevents backoff from growing indefinitely.
 *
 * @default 600000 (10 minutes)
 * @env ADDRESSKIT_INDEX_BACKOFF_MAX
 */
export declare const INDEX_BACKOFF_MAX: number;
/**
 * Maximum number of retry attempts for failed index requests.
 * After this many failures, the operation will throw an error.
 * Set to 0 for unlimited retries (not recommended for production).
 *
 * @default 10
 * @env ADDRESSKIT_INDEX_MAX_RETRIES
 */
export declare const INDEX_MAX_RETRIES: number;
/**
 * Timeout for individual bulk indexing requests.
 * OpenSearch may need significant time for large batches.
 *
 * @default "300s" (5 minutes)
 * @env ADDRESSKIT_INDEX_TIMEOUT
 */
export declare const INDEX_TIMEOUT: string;
/**
 * Chunk size in megabytes for parsing G-NAF address files.
 * Larger chunks use more memory but may be faster.
 *
 * @default 10 (MB)
 * @env ADDRESSKIT_LOADING_CHUNK_SIZE
 */
export declare const LOADING_CHUNK_SIZE: number;
/**
 * Whether to enable geocoding data loading.
 * Geocodes add latitude/longitude but increase index size significantly.
 *
 * @default false
 * @env ADDRESSKIT_ENABLE_GEO
 */
export declare const ENABLE_GEO: boolean;
/**
 * URL to the G-NAF package metadata on data.gov.au.
 * Used to discover the latest G-NAF download URL.
 *
 * @default "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc"
 * @env GNAF_PACKAGE_URL
 */
export declare const GNAF_PACKAGE_URL: string;
/**
 * Local directory for storing downloaded G-NAF data files.
 *
 * @default "target/gnaf"
 * @env GNAF_DIR
 */
export declare const GNAF_DIR: string;
/**
 * Number of seconds in a day.
 */
export declare const ONE_DAY_S = 86400;
/**
 * Number of milliseconds in a day.
 */
export declare const ONE_DAY_MS: number;
/**
 * Number of milliseconds in 30 days.
 * Used for stale cache threshold.
 */
export declare const THIRTY_DAYS_MS: number;
/**
 * HTTP port for the API server.
 *
 * @default 8080
 * @env PORT
 */
export declare const SERVER_PORT: number;
/**
 * CORS Access-Control-Allow-Origin header value.
 * Set to "*" to allow all origins, or a specific domain.
 *
 * @default undefined (no CORS header)
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN
 */
export declare const CORS_ALLOW_ORIGIN: string | undefined;
/**
 * CORS Access-Control-Expose-Headers header value.
 * Comma-separated list of headers to expose to the client.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS
 */
export declare const CORS_EXPOSE_HEADERS: string | undefined;
/**
 * CORS Access-Control-Allow-Headers header value.
 * Comma-separated list of headers allowed in requests.
 *
 * @default undefined
 * @env ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS
 */
export declare const CORS_ALLOW_HEADERS: string | undefined;
/**
 * Maximum number of entries in the search result cache.
 * Higher values improve hit rate but consume more memory.
 *
 * @default 1000
 * @env ADDRESSKIT_CACHE_MAX_ENTRIES
 */
export declare const CACHE_MAX_ENTRIES: number;
/**
 * TTL (Time-To-Live) for search cache entries in milliseconds.
 * Balance freshness with performance based on your data update frequency.
 *
 * @default 300000 (5 minutes)
 * @env ADDRESSKIT_CACHE_TTL_MS
 */
export declare const CACHE_TTL_MS: number;
/**
 * Whether to enable search result caching.
 * Disable for development or when debugging cache issues.
 *
 * @default true
 * @env ADDRESSKIT_CACHE_ENABLED
 */
export declare const CACHE_ENABLED: boolean;
/**
 * Number of consecutive failures before the circuit opens.
 * Lower values provide faster failure detection but may trigger on transient issues.
 *
 * @default 5
 * @env ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD
 */
export declare const CIRCUIT_FAILURE_THRESHOLD: number;
/**
 * Time in milliseconds before the circuit attempts to close after opening.
 * Gives the downstream service time to recover.
 *
 * @default 30000 (30 seconds)
 * @env ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS
 */
export declare const CIRCUIT_RESET_TIMEOUT_MS: number;
/**
 * Number of successful requests required to close the circuit from half-open.
 * Ensures service is reliably recovered before resuming normal traffic.
 *
 * @default 3
 * @env ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD
 */
export declare const CIRCUIT_SUCCESS_THRESHOLD: number;
/**
 * Whether to enable dynamic resource-aware configuration.
 * When enabled, chunk sizes are calculated based on available system memory.
 *
 * @default true
 * @env ADDRESSKIT_DYNAMIC_RESOURCES
 */
export declare const DYNAMIC_RESOURCES_ENABLED: boolean;
/**
 * Target memory utilization for resource calculations (0-1).
 * Lower values leave more headroom for other processes.
 *
 * @default 0.7 (70%)
 * @env ADDRESSKIT_TARGET_MEMORY_UTILIZATION
 */
export declare const TARGET_MEMORY_UTILIZATION: number;
/**
 * Whether to enable verbose logging.
 *
 * @default false
 * @env VERBOSE
 */
export declare const VERBOSE: boolean;
//# sourceMappingURL=config.d.ts.map