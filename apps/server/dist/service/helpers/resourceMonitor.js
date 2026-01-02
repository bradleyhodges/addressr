"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForMemory = exports.isMemoryPressure = exports.getOptimalConcurrency = exports.getOptimalChunkSize = exports.ResourceMonitor = void 0;
const os = require("node:os");
const debug_1 = require("debug");
// ---------------------------------------------------------------------------------
// Debug Loggers
// ---------------------------------------------------------------------------------
/** Logger for resource monitoring events */
const logger = (0, debug_1.default)("api:resources");
/** Logger for resource-related errors */
const error = (0, debug_1.default)("error:resources");
// ---------------------------------------------------------------------------------
// Resource Thresholds and Constants
// ---------------------------------------------------------------------------------
/**
 * Minimum available memory (in bytes) before triggering memory pressure warnings.
 * Set to 512MB to ensure system stability during loading.
 *
 * @constant
 */
const MIN_AVAILABLE_MEMORY_BYTES = 512 * 1024 * 1024;
/**
 * Target memory utilization percentage for loading operations.
 * Leaving 30% headroom for OS and other processes.
 *
 * @constant
 */
const TARGET_MEMORY_UTILIZATION = 0.7;
/**
 * Minimum chunk size in megabytes regardless of available memory.
 * Ensures reasonable throughput even on memory-constrained systems.
 *
 * @constant
 */
const MIN_CHUNK_SIZE_MB = 2;
/**
 * Maximum chunk size in megabytes regardless of available memory.
 * Prevents excessive memory allocation on high-memory systems.
 *
 * @constant
 */
const MAX_CHUNK_SIZE_MB = 64;
/**
 * Memory check interval in milliseconds during loading operations.
 * Balances responsiveness with overhead.
 *
 * @constant
 */
const MEMORY_CHECK_INTERVAL_MS = 5000;
/**
 * Number of memory samples to average for smoothing.
 *
 * @constant
 */
const MEMORY_SAMPLE_COUNT = 5;
// ---------------------------------------------------------------------------------
// Resource Monitor Class
// ---------------------------------------------------------------------------------
/**
 * Monitors system resources and provides adaptive configuration for data loading.
 *
 * This class detects available memory and CPU resources at runtime, calculates
 * optimal chunk sizes for G-NAF parsing, and provides hooks for memory pressure
 * events to enable adaptive throttling during loading operations.
 */
class ResourceMonitor {
    /** Singleton instance */
    static instance;
    /** Configuration for this monitor */
    config;
    /** Interval handle for periodic monitoring */
    monitoringInterval;
    /** Registered memory pressure callbacks */
    pressureCallbacks = [];
    /** Rolling memory samples for smoothing */
    memorySamples = [];
    /** Whether monitoring is currently active */
    isMonitoring = false;
    /**
     * Creates a new ResourceMonitor with the specified configuration.
     *
     * @param config - Optional partial configuration to override defaults.
     */
    constructor(config) {
        // Merge provided config with defaults
        this.config = {
            targetUtilization: config?.targetUtilization ?? TARGET_MEMORY_UTILIZATION,
            minChunkSizeMB: config?.minChunkSizeMB ?? MIN_CHUNK_SIZE_MB,
            maxChunkSizeMB: config?.maxChunkSizeMB ?? MAX_CHUNK_SIZE_MB,
            checkIntervalMs: config?.checkIntervalMs ?? MEMORY_CHECK_INTERVAL_MS,
        };
        // Log initial resource state on creation
        logger("ResourceMonitor initialized with config:", this.config);
        logger("Initial resource state:", this.getSnapshot());
    }
    /**
     * Gets the singleton ResourceMonitor instance.
     *
     * @param config - Optional configuration (only used on first call).
     * @returns The singleton ResourceMonitor instance.
     */
    static getInstance(config) {
        // Create instance if it doesn't exist
        if (ResourceMonitor.instance === undefined) {
            ResourceMonitor.instance = new ResourceMonitor(config);
        }
        return ResourceMonitor.instance;
    }
    /**
     * Resets the singleton instance (primarily for testing).
     */
    static resetInstance() {
        if (ResourceMonitor.instance !== undefined) {
            ResourceMonitor.instance.stopMonitoring();
            ResourceMonitor.instance = undefined;
        }
    }
    /**
     * Captures the current system resource state.
     *
     * @returns A snapshot of current resource metrics and calculated optimal settings.
     */
    getSnapshot() {
        // Gather raw memory metrics
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const processMemory = process.memoryUsage();
        // Calculate optimal chunk size based on available memory
        const optimalChunkSizeMB = this.calculateOptimalChunkSize(freeMemory);
        // Determine if we're under memory pressure
        const memoryPressure = freeMemory < MIN_AVAILABLE_MEMORY_BYTES;
        // Build and return the snapshot
        return {
            totalMemory,
            freeMemory,
            processMemory: processMemory.rss,
            heapUsed: processMemory.heapUsed,
            heapTotal: processMemory.heapTotal,
            cpuCount: os.cpus().length,
            optimalChunkSizeMB,
            memoryPressure,
            timestamp: Date.now(),
        };
    }
    /**
     * Calculates the optimal chunk size based on available memory.
     *
     * The algorithm allocates a portion of available memory for chunk processing,
     * accounting for the expansion factor when parsing CSV/PSV data into objects.
     *
     * @param availableMemory - Available memory in bytes.
     * @returns Optimal chunk size in megabytes.
     */
    calculateOptimalChunkSize(availableMemory) {
        // Reserve memory for target utilization (leave headroom for OS/other processes)
        const usableMemory = availableMemory * this.config.targetUtilization;
        // Account for memory expansion during parsing (CSV -> objects typically 3-5x)
        // Using 4x as a conservative estimate
        const PARSING_EXPANSION_FACTOR = 4;
        // Calculate raw chunk size in MB
        const rawChunkSizeMB = usableMemory / (1024 * 1024) / PARSING_EXPANSION_FACTOR;
        // Clamp to configured bounds
        const clampedSize = Math.max(this.config.minChunkSizeMB, Math.min(this.config.maxChunkSizeMB, rawChunkSizeMB));
        // Round down to nearest integer for cleaner config
        return Math.floor(clampedSize);
    }
    /**
     * Calculates the optimal number of concurrent operations based on CPU and memory.
     *
     * Balances CPU parallelism with memory constraints to avoid overwhelming
     * either resource during loading operations.
     *
     * @returns Recommended concurrency level for parallel operations.
     */
    getOptimalConcurrency() {
        const snapshot = this.getSnapshot();
        // Base concurrency on CPU count (leave 1 core for OS/other tasks)
        const cpuBasedConcurrency = Math.max(1, snapshot.cpuCount - 1);
        // Reduce concurrency if under memory pressure
        if (snapshot.memoryPressure) {
            logger("Memory pressure detected, reducing concurrency to 1");
            return 1;
        }
        // Calculate memory-based concurrency limit
        // Assume each concurrent operation needs ~200MB working memory
        const MEMORY_PER_OPERATION_MB = 200;
        const availableMB = snapshot.freeMemory / (1024 * 1024);
        const memoryBasedConcurrency = Math.floor((availableMB * this.config.targetUtilization) /
            MEMORY_PER_OPERATION_MB);
        // Return the minimum of CPU and memory constraints
        const optimalConcurrency = Math.max(1, Math.min(cpuBasedConcurrency, memoryBasedConcurrency));
        logger(`Optimal concurrency: ${optimalConcurrency} (CPU: ${cpuBasedConcurrency}, Memory: ${memoryBasedConcurrency})`);
        return optimalConcurrency;
    }
    /**
     * Registers a callback to be invoked when memory pressure is detected.
     *
     * Memory pressure callbacks enable adaptive behavior during loading,
     * such as pausing operations or reducing batch sizes.
     *
     * @param callback - Function to call when memory pressure is detected.
     */
    onMemoryPressure(callback) {
        this.pressureCallbacks.push(callback);
    }
    /**
     * Starts periodic resource monitoring.
     *
     * While monitoring is active, the monitor will periodically check
     * resource state and invoke memory pressure callbacks as needed.
     */
    startMonitoring() {
        // Avoid duplicate monitoring intervals
        if (this.isMonitoring) {
            logger("Monitoring already active, skipping start");
            return;
        }
        this.isMonitoring = true;
        logger("Starting resource monitoring");
        // Set up periodic monitoring
        this.monitoringInterval = setInterval(() => {
            this.checkResources();
        }, this.config.checkIntervalMs);
        // Prevent the interval from keeping the process alive
        this.monitoringInterval.unref();
    }
    /**
     * Stops periodic resource monitoring.
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        this.isMonitoring = false;
        logger("Stopping resource monitoring");
        if (this.monitoringInterval !== undefined) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        // Clear memory samples
        this.memorySamples = [];
    }
    /**
     * Performs a resource check and invokes callbacks if pressure is detected.
     */
    checkResources() {
        const snapshot = this.getSnapshot();
        // Add to rolling samples for smoothing
        this.memorySamples.push(snapshot.freeMemory);
        if (this.memorySamples.length > MEMORY_SAMPLE_COUNT) {
            this.memorySamples.shift();
        }
        // Calculate smoothed average
        const averageFreeMemory = this.memorySamples.reduce((a, b) => a + b, 0) /
            this.memorySamples.length;
        // Check for sustained memory pressure
        if (averageFreeMemory < MIN_AVAILABLE_MEMORY_BYTES) {
            logger(`Memory pressure detected: ${Math.round(averageFreeMemory / (1024 * 1024))}MB average free`);
            // Invoke all registered callbacks
            for (const callback of this.pressureCallbacks) {
                try {
                    callback(snapshot);
                }
                catch (err) {
                    error("Memory pressure callback error:", err);
                }
            }
        }
    }
    /**
     * Forces a garbage collection if available (requires --expose-gc flag).
     *
     * This is useful during loading operations to reclaim memory between
     * large chunk operations.
     *
     * @returns Whether garbage collection was triggered.
     */
    tryForceGC() {
        // Check if gc() is exposed (requires --expose-gc V8 flag)
        // biome-ignore lint/suspicious/noExplicitAny: Accessing global gc() which may not exist
        if (typeof global.gc === "function") {
            logger("Forcing garbage collection");
            // biome-ignore lint/suspicious/noExplicitAny: Accessing global gc() which may not exist
            global.gc();
            return true;
        }
        logger("Garbage collection not available (run with --expose-gc)");
        return false;
    }
    /**
     * Logs a detailed resource report for debugging.
     */
    logResourceReport() {
        const snapshot = this.getSnapshot();
        const formatMB = (bytes) => `${Math.round(bytes / (1024 * 1024))}MB`;
        logger("=== Resource Report ===");
        logger(`Total Memory:     ${formatMB(snapshot.totalMemory)}`);
        logger(`Free Memory:      ${formatMB(snapshot.freeMemory)}`);
        logger(`Process RSS:      ${formatMB(snapshot.processMemory)}`);
        logger(`Heap Used:        ${formatMB(snapshot.heapUsed)}`);
        logger(`Heap Total:       ${formatMB(snapshot.heapTotal)}`);
        logger(`CPU Cores:        ${snapshot.cpuCount}`);
        logger(`Optimal Chunk:    ${snapshot.optimalChunkSizeMB}MB`);
        logger(`Memory Pressure:  ${snapshot.memoryPressure}`);
        logger("========================");
    }
}
exports.ResourceMonitor = ResourceMonitor;
// ---------------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------------
/**
 * Gets the current optimal chunk size for G-NAF loading.
 *
 * This is a convenience function that uses the singleton ResourceMonitor
 * to calculate the optimal chunk size based on current system resources.
 *
 * @returns Optimal chunk size in megabytes.
 */
const getOptimalChunkSize = () => {
    return ResourceMonitor.getInstance().getSnapshot().optimalChunkSizeMB;
};
exports.getOptimalChunkSize = getOptimalChunkSize;
/**
 * Gets the current optimal concurrency level for parallel operations.
 *
 * @returns Recommended number of concurrent operations.
 */
const getOptimalConcurrency = () => {
    return ResourceMonitor.getInstance().getOptimalConcurrency();
};
exports.getOptimalConcurrency = getOptimalConcurrency;
/**
 * Checks if the system is currently under memory pressure.
 *
 * @returns True if memory pressure is detected.
 */
const isMemoryPressure = () => {
    return ResourceMonitor.getInstance().getSnapshot().memoryPressure;
};
exports.isMemoryPressure = isMemoryPressure;
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
const waitForMemory = async (checkIntervalMs = 1000, maxWaitMs = 30000) => {
    const startTime = Date.now();
    while ((0, exports.isMemoryPressure)()) {
        // Check if we've exceeded maximum wait time
        if (Date.now() - startTime > maxWaitMs) {
            logger(`Memory wait timeout (${maxWaitMs}ms), proceeding despite pressure`);
            break;
        }
        // Try to force GC to reclaim memory
        ResourceMonitor.getInstance().tryForceGC();
        // Wait before checking again
        logger(`Waiting for memory (${checkIntervalMs}ms)...`);
        await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
};
exports.waitForMemory = waitForMemory;
//# sourceMappingURL=resourceMonitor.js.map