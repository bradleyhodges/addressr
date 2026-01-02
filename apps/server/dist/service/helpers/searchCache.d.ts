/**
 * LRU (Least Recently Used) cache for address search/autocomplete results.
 *
 * This module provides in-memory caching for frequently accessed search queries
 * to reduce load on OpenSearch and improve response times for common searches.
 * The cache implements TTL (Time-To-Live) expiration and memory-aware eviction.
 *
 * @module searchCache
 */
/**
 * Statistics about cache performance.
 */
export type CacheStats = {
    /** Total number of cache hits */
    hits: number;
    /** Total number of cache misses */
    misses: number;
    /** Current number of entries in the cache */
    size: number;
    /** Maximum number of entries allowed */
    maxSize: number;
    /** Cache hit rate as a percentage */
    hitRate: number;
    /** Number of entries evicted due to TTL */
    ttlEvictions: number;
    /** Number of entries evicted due to capacity */
    lruEvictions: number;
};
/**
 * Configuration options for the LRU cache.
 */
export type CacheConfig = {
    /** Maximum number of entries to store */
    maxEntries: number;
    /** TTL for entries in milliseconds */
    ttlMs: number;
    /** Whether to run periodic maintenance */
    enableMaintenance: boolean;
};
/**
 * Memory-efficient LRU cache with TTL support for search results.
 *
 * This cache uses a Map for O(1) lookups while maintaining insertion order
 * for LRU eviction. Expired entries are cleaned up during access and via
 * periodic maintenance.
 *
 * @template T - The type of values stored in the cache.
 */
export declare class LRUCache<T> {
    /** The underlying storage Map */
    private cache;
    /** Configuration for this cache instance */
    private config;
    /** Statistics counters */
    private stats;
    /** Handle for the maintenance interval */
    private maintenanceInterval;
    /**
     * Creates a new LRU cache with the specified configuration.
     *
     * @param config - Partial configuration to override defaults.
     */
    constructor(config?: Partial<CacheConfig>);
    /**
     * Retrieves a value from the cache if present and not expired.
     *
     * This operation updates the entry's last accessed time for LRU tracking.
     *
     * @param key - The cache key to look up.
     * @returns The cached value, or undefined if not found or expired.
     */
    get(key: string): T | undefined;
    /**
     * Stores a value in the cache with the given key.
     *
     * If the cache is at capacity, the least recently used entry is evicted.
     *
     * @param key - The cache key to store under.
     * @param value - The value to cache.
     */
    set(key: string, value: T): void;
    /**
     * Checks if a key exists in the cache and is not expired.
     *
     * This is a non-mutating check that doesn't update access time.
     *
     * @param key - The cache key to check.
     * @returns True if the key exists and is not expired.
     */
    has(key: string): boolean;
    /**
     * Removes a specific key from the cache.
     *
     * @param key - The cache key to remove.
     * @returns True if the key was found and removed.
     */
    delete(key: string): boolean;
    /**
     * Clears all entries from the cache.
     */
    clear(): void;
    /**
     * Gets current cache statistics.
     *
     * @returns Statistics about cache performance and usage.
     */
    getStats(): CacheStats;
    /**
     * Resets cache statistics counters.
     */
    resetStats(): void;
    /**
     * Evicts the least recently used entry from the cache.
     */
    private evictLRU;
    /**
     * Runs maintenance to evict expired entries.
     *
     * This is called periodically to prevent memory leaks from
     * entries that expire but are never accessed.
     */
    private runMaintenance;
    /**
     * Starts the periodic maintenance interval.
     */
    private startMaintenance;
    /**
     * Stops the periodic maintenance interval and cleans up.
     */
    destroy(): void;
}
/**
 * Type for cached search results.
 */
export type CachedSearchResult = {
    /** The search response body */
    results: unknown[];
    /** Total number of hits for pagination */
    totalHits: number;
    /** Page number of this result */
    page: number;
    /** Page size used */
    size: number;
};
/**
 * Gets the singleton search cache instance.
 *
 * The cache is lazily initialized on first access with configuration
 * from environment variables if available.
 *
 * @returns The singleton search cache instance.
 */
export declare const getSearchCache: () => LRUCache<CachedSearchResult>;
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
export declare const generateSearchCacheKey: (query: string, page: number, size: number) => string;
/**
 * Resets the singleton search cache (primarily for testing).
 */
export declare const resetSearchCache: () => void;
//# sourceMappingURL=searchCache.d.ts.map