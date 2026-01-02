/**
 * Resource monitoring and adaptive configuration module.
 *
 * This module provides dynamic resource detection and monitoring capabilities
 * to optimize G-NAF loading performance based on available system resources.
 * It enables the loader to adapt to different host machine configurations
 * without manual tuning.
 *
 * @module resourceMonitor
 */
/**
 * Snapshot of current system resource state.
 */
export type ResourceSnapshot = {
    /** Total system memory in bytes */
    totalMemory: number;
    /** Free system memory in bytes */
    freeMemory: number;
    /** Memory used by this process in bytes */
    processMemory: number;
    /** Heap memory used by V8 in bytes */
    heapUsed: number;
    /** Total heap size allocated by V8 in bytes */
    heapTotal: number;
    /** Number of CPU cores available */
    cpuCount: number;
    /** Calculated optimal chunk size in MB */
    optimalChunkSizeMB: number;
    /** Whether memory pressure is detected */
    memoryPressure: boolean;
    /** Timestamp of this snapshot */
    timestamp: number;
};
/**
 * Configuration for adaptive resource management.
 */
export type ResourceConfig = {
    /** Target memory utilization (0-1) */
    targetUtilization: number;
    /** Minimum chunk size in MB */
    minChunkSizeMB: number;
    /** Maximum chunk size in MB */
    maxChunkSizeMB: number;
    /** Memory check interval in ms */
    checkIntervalMs: number;
};
/**
 * Callback for memory pressure events.
 */
export type MemoryPressureCallback = (snapshot: ResourceSnapshot) => void;
/**
 * Monitors system resources and provides adaptive configuration for data loading.
 *
 * This class detects available memory and CPU resources at runtime, calculates
 * optimal chunk sizes for G-NAF parsing, and provides hooks for memory pressure
 * events to enable adaptive throttling during loading operations.
 */
export declare class ResourceMonitor {
    /** Singleton instance */
    private static instance;
    /** Configuration for this monitor */
    private config;
    /** Interval handle for periodic monitoring */
    private monitoringInterval;
    /** Registered memory pressure callbacks */
    private pressureCallbacks;
    /** Rolling memory samples for smoothing */
    private memorySamples;
    /** Whether monitoring is currently active */
    private isMonitoring;
    /**
     * Creates a new ResourceMonitor with the specified configuration.
     *
     * @param config - Optional partial configuration to override defaults.
     */
    private constructor();
    /**
     * Gets the singleton ResourceMonitor instance.
     *
     * @param config - Optional configuration (only used on first call).
     * @returns The singleton ResourceMonitor instance.
     */
    static getInstance(config?: Partial<ResourceConfig>): ResourceMonitor;
    /**
     * Resets the singleton instance (primarily for testing).
     */
    static resetInstance(): void;
    /**
     * Captures the current system resource state.
     *
     * @returns A snapshot of current resource metrics and calculated optimal settings.
     */
    getSnapshot(): ResourceSnapshot;
    /**
     * Calculates the optimal chunk size based on available memory.
     *
     * The algorithm allocates a portion of available memory for chunk processing,
     * accounting for the expansion factor when parsing CSV/PSV data into objects.
     *
     * @param availableMemory - Available memory in bytes.
     * @returns Optimal chunk size in megabytes.
     */
    private calculateOptimalChunkSize;
    /**
     * Calculates the optimal number of concurrent operations based on CPU and memory.
     *
     * Balances CPU parallelism with memory constraints to avoid overwhelming
     * either resource during loading operations.
     *
     * @returns Recommended concurrency level for parallel operations.
     */
    getOptimalConcurrency(): number;
    /**
     * Registers a callback to be invoked when memory pressure is detected.
     *
     * Memory pressure callbacks enable adaptive behavior during loading,
     * such as pausing operations or reducing batch sizes.
     *
     * @param callback - Function to call when memory pressure is detected.
     */
    onMemoryPressure(callback: MemoryPressureCallback): void;
    /**
     * Starts periodic resource monitoring.
     *
     * While monitoring is active, the monitor will periodically check
     * resource state and invoke memory pressure callbacks as needed.
     */
    startMonitoring(): void;
    /**
     * Stops periodic resource monitoring.
     */
    stopMonitoring(): void;
    /**
     * Performs a resource check and invokes callbacks if pressure is detected.
     */
    private checkResources;
    /**
     * Forces a garbage collection if available (requires --expose-gc flag).
     *
     * This is useful during loading operations to reclaim memory between
     * large chunk operations.
     *
     * @returns Whether garbage collection was triggered.
     */
    tryForceGC(): boolean;
    /**
     * Logs a detailed resource report for debugging.
     */
    logResourceReport(): void;
}
/**
 * Gets the current optimal chunk size for G-NAF loading.
 *
 * This is a convenience function that uses the singleton ResourceMonitor
 * to calculate the optimal chunk size based on current system resources.
 *
 * @returns Optimal chunk size in megabytes.
 */
export declare const getOptimalChunkSize: () => number;
/**
 * Gets the current optimal concurrency level for parallel operations.
 *
 * @returns Recommended number of concurrent operations.
 */
export declare const getOptimalConcurrency: () => number;
/**
 * Checks if the system is currently under memory pressure.
 *
 * @returns True if memory pressure is detected.
 */
export declare const isMemoryPressure: () => boolean;
/**
 * Waits for memory to become available before proceeding.
 *
 * This function polls memory state and resolves when sufficient memory
 * is available, enabling adaptive throttling during loading.
 *
 * @param checkIntervalMs - Interval between memory checks (default 1000ms).
 * @param maxWaitMs - Maximum time to wait before proceeding anyway (default 30000ms).
 * @returns Promise that resolves when memory is available or timeout is reached.
 */
export declare const waitForMemory: (checkIntervalMs?: number, maxWaitMs?: number) => Promise<void>;
//# sourceMappingURL=resourceMonitor.d.ts.map