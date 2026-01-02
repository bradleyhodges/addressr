"use strict";
/**
 * Re-exports configuration values from the centralized config module.
 *
 * This file exists for backwards compatibility with existing imports.
 * New code should import directly from "./config" instead.
 *
 * @module conf
 * @deprecated Import from "./config" directly for new code
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COVERED_STATES = exports.TARGET_MEMORY_UTILIZATION = exports.DYNAMIC_RESOURCES_ENABLED = exports.CIRCUIT_SUCCESS_THRESHOLD = exports.CIRCUIT_RESET_TIMEOUT_MS = exports.CIRCUIT_FAILURE_THRESHOLD = exports.CACHE_ENABLED = exports.CACHE_TTL_MS = exports.CACHE_MAX_ENTRIES = exports.CORS_ALLOW_HEADERS = exports.CORS_EXPOSE_HEADERS = exports.CORS_ALLOW_ORIGIN = exports.SERVER_PORT = exports.THIRTY_DAYS_MS = exports.ONE_DAY_MS = exports.ONE_DAY_S = exports.GNAF_DIR = exports.GNAF_PACKAGE_URL = exports.ENABLE_GEO = exports.LOADING_CHUNK_SIZE = exports.INDEX_TIMEOUT = exports.INDEX_MAX_RETRIES = exports.INDEX_BACKOFF_MAX = exports.INDEX_BACKOFF_INCREMENT = exports.INDEX_BACKOFF_INITIAL = exports.ES_CLEAR_INDEX = exports.ES_INDEX_NAME = exports.MAX_PAGE_NUMBER = exports.MAX_PAGE_SIZE = exports.PAGE_SIZE = void 0;
const getCoveredStates_1 = require("./helpers/getCoveredStates");
// Re-export all configuration values from the centralized config module
var config_1 = require("./config");
Object.defineProperty(exports, "PAGE_SIZE", { enumerable: true, get: function () { return config_1.PAGE_SIZE; } });
Object.defineProperty(exports, "MAX_PAGE_SIZE", { enumerable: true, get: function () { return config_1.MAX_PAGE_SIZE; } });
Object.defineProperty(exports, "MAX_PAGE_NUMBER", { enumerable: true, get: function () { return config_1.MAX_PAGE_NUMBER; } });
Object.defineProperty(exports, "ES_INDEX_NAME", { enumerable: true, get: function () { return config_1.ES_INDEX_NAME; } });
Object.defineProperty(exports, "ES_CLEAR_INDEX", { enumerable: true, get: function () { return config_1.ES_CLEAR_INDEX; } });
Object.defineProperty(exports, "INDEX_BACKOFF_INITIAL", { enumerable: true, get: function () { return config_1.INDEX_BACKOFF_INITIAL; } });
Object.defineProperty(exports, "INDEX_BACKOFF_INCREMENT", { enumerable: true, get: function () { return config_1.INDEX_BACKOFF_INCREMENT; } });
Object.defineProperty(exports, "INDEX_BACKOFF_MAX", { enumerable: true, get: function () { return config_1.INDEX_BACKOFF_MAX; } });
Object.defineProperty(exports, "INDEX_MAX_RETRIES", { enumerable: true, get: function () { return config_1.INDEX_MAX_RETRIES; } });
Object.defineProperty(exports, "INDEX_TIMEOUT", { enumerable: true, get: function () { return config_1.INDEX_TIMEOUT; } });
Object.defineProperty(exports, "LOADING_CHUNK_SIZE", { enumerable: true, get: function () { return config_1.LOADING_CHUNK_SIZE; } });
Object.defineProperty(exports, "ENABLE_GEO", { enumerable: true, get: function () { return config_1.ENABLE_GEO; } });
Object.defineProperty(exports, "GNAF_PACKAGE_URL", { enumerable: true, get: function () { return config_1.GNAF_PACKAGE_URL; } });
Object.defineProperty(exports, "GNAF_DIR", { enumerable: true, get: function () { return config_1.GNAF_DIR; } });
Object.defineProperty(exports, "ONE_DAY_S", { enumerable: true, get: function () { return config_1.ONE_DAY_S; } });
Object.defineProperty(exports, "ONE_DAY_MS", { enumerable: true, get: function () { return config_1.ONE_DAY_MS; } });
Object.defineProperty(exports, "THIRTY_DAYS_MS", { enumerable: true, get: function () { return config_1.THIRTY_DAYS_MS; } });
Object.defineProperty(exports, "SERVER_PORT", { enumerable: true, get: function () { return config_1.SERVER_PORT; } });
Object.defineProperty(exports, "CORS_ALLOW_ORIGIN", { enumerable: true, get: function () { return config_1.CORS_ALLOW_ORIGIN; } });
Object.defineProperty(exports, "CORS_EXPOSE_HEADERS", { enumerable: true, get: function () { return config_1.CORS_EXPOSE_HEADERS; } });
Object.defineProperty(exports, "CORS_ALLOW_HEADERS", { enumerable: true, get: function () { return config_1.CORS_ALLOW_HEADERS; } });
// Caching configuration
Object.defineProperty(exports, "CACHE_MAX_ENTRIES", { enumerable: true, get: function () { return config_1.CACHE_MAX_ENTRIES; } });
Object.defineProperty(exports, "CACHE_TTL_MS", { enumerable: true, get: function () { return config_1.CACHE_TTL_MS; } });
Object.defineProperty(exports, "CACHE_ENABLED", { enumerable: true, get: function () { return config_1.CACHE_ENABLED; } });
// Circuit breaker configuration
Object.defineProperty(exports, "CIRCUIT_FAILURE_THRESHOLD", { enumerable: true, get: function () { return config_1.CIRCUIT_FAILURE_THRESHOLD; } });
Object.defineProperty(exports, "CIRCUIT_RESET_TIMEOUT_MS", { enumerable: true, get: function () { return config_1.CIRCUIT_RESET_TIMEOUT_MS; } });
Object.defineProperty(exports, "CIRCUIT_SUCCESS_THRESHOLD", { enumerable: true, get: function () { return config_1.CIRCUIT_SUCCESS_THRESHOLD; } });
// Resource management configuration
Object.defineProperty(exports, "DYNAMIC_RESOURCES_ENABLED", { enumerable: true, get: function () { return config_1.DYNAMIC_RESOURCES_ENABLED; } });
Object.defineProperty(exports, "TARGET_MEMORY_UTILIZATION", { enumerable: true, get: function () { return config_1.TARGET_MEMORY_UTILIZATION; } });
/**
 * The covered, supported Australian states.
 * Parsed from the COVERED_STATES environment variable.
 */
exports.COVERED_STATES = (0, getCoveredStates_1.getCoveredStates)();
//# sourceMappingURL=conf.js.map