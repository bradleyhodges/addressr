/**
 * Re-exports configuration values from the centralized config module.
 *
 * This file exists for backwards compatibility with existing imports.
 * New code should import directly from "./config" instead.
 *
 * @module conf
 * @deprecated Import from "./config" directly for new code
 */

import { getCoveredStates } from "./helpers/getCoveredStates";

// Re-export all configuration values from the centralized config module
export {
    PAGE_SIZE,
    MAX_PAGE_SIZE,
    MAX_PAGE_NUMBER,
    ES_INDEX_NAME,
    ES_LOCALITY_INDEX_NAME,
    ES_CLEAR_INDEX,
    INDEX_BACKOFF_INITIAL,
    INDEX_BACKOFF_INCREMENT,
    INDEX_BACKOFF_MAX,
    INDEX_MAX_RETRIES,
    INDEX_TIMEOUT,
    LOADING_CHUNK_SIZE,
    ENABLE_GEO,
    GNAF_MIRROR_URL,
    GNAF_PACKAGE_URL,
    GNAF_USE_MIRROR,
    GNAF_DIR,
    ONE_DAY_S,
    ONE_DAY_MS,
    THIRTY_DAYS_MS,
    SERVER_PORT,
    CORS_ALLOW_ORIGIN,
    CORS_EXPOSE_HEADERS,
    CORS_ALLOW_HEADERS,
    // Caching configuration
    CACHE_MAX_ENTRIES,
    CACHE_TTL_MS,
    CACHE_ENABLED,
    // Circuit breaker configuration
    CIRCUIT_FAILURE_THRESHOLD,
    CIRCUIT_RESET_TIMEOUT_MS,
    CIRCUIT_SUCCESS_THRESHOLD,
    // Download configuration
    DOWNLOAD_MAX_RETRIES,
    DOWNLOAD_BACKOFF_INITIAL,
    DOWNLOAD_BACKOFF_MAX,
    DOWNLOAD_SOCKET_TIMEOUT,
    DOWNLOAD_CONNECT_TIMEOUT,
    // Resource management configuration
    DYNAMIC_RESOURCES_ENABLED,
    TARGET_MEMORY_UTILIZATION,
} from "./config";

/**
 * The covered, supported Australian states.
 * Parsed from the COVERED_STATES environment variable.
 */
export const COVERED_STATES = getCoveredStates();
