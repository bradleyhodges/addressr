"use strict";
/**
 * LRU (Least Recently Used) cache for address search/autocomplete results.
 *
 * This module provides in-memory caching for frequently accessed search queries
 * to reduce load on OpenSearch and improve response times for common searches.
 * The cache implements TTL (Time-To-Live) expiration and memory-aware eviction.
 *
 * @module searchCache
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetSearchCache = exports.generateSearchCacheKey = exports.getSearchCache = exports.LRUCache = void 0;
const debug_1 = require("debug");
// ---------------------------------------------------------------------------------
// Debug Loggers
// ---------------------------------------------------------------------------------
/** Logger for cache operations */
const logger = (0, debug_1.default)("api:cache");
/** Logger for cache-related errors */
const error = (0, debug_1.default)("error:cache");
// ---------------------------------------------------------------------------------
// Cache Configuration
// ---------------------------------------------------------------------------------
/**
 * Default maximum number of entries in the cache.
 * Balances memory usage with cache hit rate.
 *
 * @constant
 */
const DEFAULT_MAX_ENTRIES = 1000;
/**
 * Default TTL (Time-To-Live) for cache entries in milliseconds.
 * Set to 5 minutes to balance freshness with performance.
 *
 * @constant
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
/**
 * Interval for running cache maintenance (eviction of expired entries).
 *
 * @constant
 */
const MAINTENANCE_INTERVAL_MS = 60 * 1000;
// ---------------------------------------------------------------------------------
// LRU Cache Implementation
// ---------------------------------------------------------------------------------
/**
 * Memory-efficient LRU cache with TTL support for search results.
 *
 * This cache uses a Map for O(1) lookups while maintaining insertion order
 * for LRU eviction. Expired entries are cleaned up during access and via
 * periodic maintenance.
 *
 * @template T - The type of values stored in the cache.
 */
class LRUCache {
    /** The underlying storage Map */
    cache;
    /** Configuration for this cache instance */
    config;
    /** Statistics counters */
    stats = {
        hits: 0,
        misses: 0,
        ttlEvictions: 0,
        lruEvictions: 0,
    };
    /** Handle for the maintenance interval */
    maintenanceInterval;
    /**
     * Creates a new LRU cache with the specified configuration.
     *
     * @param config - Partial configuration to override defaults.
     */
    constructor(config) {
        // Initialize the cache Map
        this.cache = new Map();
        // Merge provided config with defaults
        this.config = {
            maxEntries: config?.maxEntries ?? DEFAULT_MAX_ENTRIES,
            ttlMs: config?.ttlMs ?? DEFAULT_TTL_MS,
            enableMaintenance: config?.enableMaintenance ?? true,
        };
        // Start periodic maintenance if enabled
        if (this.config.enableMaintenance) {
            this.startMaintenance();
        }
        logger(`LRU cache initialized: maxEntries=${this.config.maxEntries}, ttlMs=${this.config.ttlMs}`);
    }
    /**
     * Retrieves a value from the cache if present and not expired.
     *
     * This operation updates the entry's last accessed time for LRU tracking.
     *
     * @param key - The cache key to look up.
     * @returns The cached value, or undefined if not found or expired.
     */
    get(key) {
        const entry = this.cache.get(key);
        // Cache miss - entry not found
        if (entry === undefined) {
            this.stats.misses++;
            logger(`Cache MISS: "${key.substring(0, 50)}..."`);
            return undefined;
        }
        // Check if entry has expired
        const now = Date.now();
        if (now - entry.createdAt > this.config.ttlMs) {
            // Entry expired - remove and count as miss
            this.cache.delete(key);
            this.stats.ttlEvictions++;
            this.stats.misses++;
            logger(`Cache EXPIRED: "${key.substring(0, 50)}..."`);
            return undefined;
        }
        // Cache hit - update access metadata
        entry.lastAccessedAt = now;
        entry.hitCount++;
        this.stats.hits++;
        // Move to end of Map for LRU ordering (delete and re-add)
        // This ensures recently accessed items are at the end
        this.cache.delete(key);
        this.cache.set(key, entry);
        logger(`Cache HIT: "${key.substring(0, 50)}..." (hits: ${entry.hitCount})`);
        return entry.value;
    }
    /**
     * Stores a value in the cache with the given key.
     *
     * If the cache is at capacity, the least recently used entry is evicted.
     *
     * @param key - The cache key to store under.
     * @param value - The value to cache.
     */
    set(key, value) {
        const now = Date.now();
        // Check if we need to evict to make room
        if (this.cache.size >= this.config.maxEntries) {
            this.evictLRU();
        }
        // Create the cache entry
        const entry = {
            value,
            createdAt: now,
            lastAccessedAt: now,
            hitCount: 0,
        };
        // Store in cache
        this.cache.set(key, entry);
        logger(`Cache SET: "${key.substring(0, 50)}..." (size: ${this.cache.size})`);
    }
    /**
     * Checks if a key exists in the cache and is not expired.
     *
     * This is a non-mutating check that doesn't update access time.
     *
     * @param key - The cache key to check.
     * @returns True if the key exists and is not expired.
     */
    has(key) {
        const entry = this.cache.get(key);
        if (entry === undefined) {
            return false;
        }
        // Check expiration
        if (Date.now() - entry.createdAt > this.config.ttlMs) {
            return false;
        }
        return true;
    }
    /**
     * Removes a specific key from the cache.
     *
     * @param key - The cache key to remove.
     * @returns True if the key was found and removed.
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            logger(`Cache DELETE: "${key.substring(0, 50)}..."`);
        }
        return deleted;
    }
    /**
     * Clears all entries from the cache.
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        logger(`Cache CLEAR: removed ${size} entries`);
    }
    /**
     * Gets current cache statistics.
     *
     * @returns Statistics about cache performance and usage.
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            size: this.cache.size,
            maxSize: this.config.maxEntries,
            hitRate: Math.round(hitRate * 100) / 100,
            ttlEvictions: this.stats.ttlEvictions,
            lruEvictions: this.stats.lruEvictions,
        };
    }
    /**
     * Resets cache statistics counters.
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            ttlEvictions: 0,
            lruEvictions: 0,
        };
        logger("Cache stats reset");
    }
    /**
     * Evicts the least recently used entry from the cache.
     */
    evictLRU() {
        // Map maintains insertion order, so the first key is the LRU
        // (we move accessed items to the end in get())
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            this.cache.delete(firstKey);
            this.stats.lruEvictions++;
            logger(`Cache LRU EVICT: "${String(firstKey).substring(0, 50)}..."`);
        }
    }
    /**
     * Runs maintenance to evict expired entries.
     *
     * This is called periodically to prevent memory leaks from
     * entries that expire but are never accessed.
     */
    runMaintenance() {
        const now = Date.now();
        let evicted = 0;
        // Iterate through all entries and remove expired ones
        for (const [key, entry] of this.cache) {
            if (now - entry.createdAt > this.config.ttlMs) {
                this.cache.delete(key);
                this.stats.ttlEvictions++;
                evicted++;
            }
        }
        if (evicted > 0) {
            logger(`Cache maintenance: evicted ${evicted} expired entries`);
        }
    }
    /**
     * Starts the periodic maintenance interval.
     */
    startMaintenance() {
        this.maintenanceInterval = setInterval(() => {
            this.runMaintenance();
        }, MAINTENANCE_INTERVAL_MS);
        // Prevent interval from keeping the process alive
        this.maintenanceInterval.unref();
    }
    /**
     * Stops the periodic maintenance interval and cleans up.
     */
    destroy() {
        if (this.maintenanceInterval !== undefined) {
            clearInterval(this.maintenanceInterval);
            this.maintenanceInterval = undefined;
        }
        this.cache.clear();
        logger("LRU cache destroyed");
    }
}
exports.LRUCache = LRUCache;
/**
 * Singleton cache instance for search results.
 */
let searchCacheInstance;
/**
 * Gets the singleton search cache instance.
 *
 * The cache is lazily initialized on first access with configuration
 * from environment variables if available.
 *
 * @returns The singleton search cache instance.
 */
const getSearchCache = () => {
    if (searchCacheInstance === undefined) {
        // Parse configuration from environment
        const maxEntries = Number.parseInt(process.env.ADDRESSKIT_CACHE_MAX_ENTRIES ?? "1000", 10);
        const ttlMs = Number.parseInt(process.env.ADDRESSKIT_CACHE_TTL_MS ?? "300000", 10);
        searchCacheInstance = new LRUCache({
            maxEntries,
            ttlMs,
        });
    }
    return searchCacheInstance;
};
exports.getSearchCache = getSearchCache;
/**
 * Generates a cache key for a search query.
 *
 * The key includes the normalized query and pagination parameters
 * to ensure different pages are cached separately.
 *
 * @param query - The normalized search query string.
 * @param page - The page number (1-indexed).
 * @param size - The page size.
 * @returns A unique cache key for this search.
 */
const generateSearchCacheKey = (query, page, size) => {
    // Normalize and lowercase for cache key consistency
    const normalizedQuery = query.toLowerCase().trim();
    return `search:${normalizedQuery}:p${page}:s${size}`;
};
exports.generateSearchCacheKey = generateSearchCacheKey;
/**
 * Resets the singleton search cache (primarily for testing).
 */
const resetSearchCache = () => {
    if (searchCacheInstance !== undefined) {
        searchCacheInstance.destroy();
        searchCacheInstance = undefined;
    }
};
exports.resetSearchCache = resetSearchCache;
//# sourceMappingURL=searchCache.js.map