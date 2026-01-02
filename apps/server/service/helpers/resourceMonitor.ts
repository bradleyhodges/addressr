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

import * as os from "node:os";
import debug from "debug";
import { VERBOSE } from "../config";

// ---------------------------------------------------------------------------------
// Debug Loggers
// ---------------------------------------------------------------------------------

/** Logger for resource monitoring events */
const logger = debug("api:resources");

/** Logger for resource-related errors */
const error = debug("error:resources");

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
// Types
// ---------------------------------------------------------------------------------

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
export class ResourceMonitor {
    /** Singleton instance */
    private static instance: ResourceMonitor | undefined;

    /** Configuration for this monitor */
    private config: ResourceConfig;

    /** Interval handle for periodic monitoring */
    private monitoringInterval: NodeJS.Timeout | undefined;

    /** Registered memory pressure callbacks */
    private pressureCallbacks: MemoryPressureCallback[] = [];

    /** Rolling memory samples for smoothing */
    private memorySamples: number[] = [];

    /** Whether monitoring is currently active */
    private isMonitoring = false;

    /**
     * Creates a new ResourceMonitor with the specified configuration.
     *
     * @param config - Optional partial configuration to override defaults.
     */
    private constructor(config?: Partial<ResourceConfig>) {
        // Merge provided config with defaults
        this.config = {
            targetUtilization:
                config?.targetUtilization ?? TARGET_MEMORY_UTILIZATION,
            minChunkSizeMB: config?.minChunkSizeMB ?? MIN_CHUNK_SIZE_MB,
            maxChunkSizeMB: config?.maxChunkSizeMB ?? MAX_CHUNK_SIZE_MB,
            checkIntervalMs:
                config?.checkIntervalMs ?? MEMORY_CHECK_INTERVAL_MS,
        };

        // Log initial resource state on creation
        if (VERBOSE)
            logger("ResourceMonitor initialized with config:", this.config);
        if (VERBOSE) logger("Initial resource state:", this.getSnapshot());
    }

    /**
     * Gets the singleton ResourceMonitor instance.
     *
     * @param config - Optional configuration (only used on first call).
     * @returns The singleton ResourceMonitor instance.
     */
    public static getInstance(
        config?: Partial<ResourceConfig>,
    ): ResourceMonitor {
        // Create instance if it doesn't exist
        if (ResourceMonitor.instance === undefined) {
            ResourceMonitor.instance = new ResourceMonitor(config);
        }
        return ResourceMonitor.instance;
    }

    /**
     * Resets the singleton instance (primarily for testing).
     */
    public static resetInstance(): void {
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
    public getSnapshot(): ResourceSnapshot {
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
    private calculateOptimalChunkSize(availableMemory: number): number {
        // Reserve memory for target utilization (leave headroom for OS/other processes)
        const usableMemory = availableMemory * this.config.targetUtilization;

        // Account for memory expansion during parsing (CSV -> objects typically 3-5x)
        // Using 4x as a conservative estimate
        const PARSING_EXPANSION_FACTOR = 4;

        // Calculate raw chunk size in MB
        const rawChunkSizeMB =
            usableMemory / (1024 * 1024) / PARSING_EXPANSION_FACTOR;

        // Clamp to configured bounds
        const clampedSize = Math.max(
            this.config.minChunkSizeMB,
            Math.min(this.config.maxChunkSizeMB, rawChunkSizeMB),
        );

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
    public getOptimalConcurrency(): number {
        const snapshot = this.getSnapshot();

        // Base concurrency on CPU count (leave 1 core for OS/other tasks)
        const cpuBasedConcurrency = Math.max(1, snapshot.cpuCount - 1);

        // Reduce concurrency if under memory pressure
        if (snapshot.memoryPressure) {
            if (VERBOSE)
                logger("Memory pressure detected, reducing concurrency to 1");
            return 1;
        }

        // Calculate memory-based concurrency limit
        // Assume each concurrent operation needs ~200MB working memory
        const MEMORY_PER_OPERATION_MB = 200;
        const availableMB = snapshot.freeMemory / (1024 * 1024);
        const memoryBasedConcurrency = Math.floor(
            (availableMB * this.config.targetUtilization) /
                MEMORY_PER_OPERATION_MB,
        );

        // Return the minimum of CPU and memory constraints
        const optimalConcurrency = Math.max(
            1,
            Math.min(cpuBasedConcurrency, memoryBasedConcurrency),
        );

        logger(
            `Optimal concurrency: ${optimalConcurrency} (CPU: ${cpuBasedConcurrency}, Memory: ${memoryBasedConcurrency})`,
        );

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
    public onMemoryPressure(callback: MemoryPressureCallback): void {
        this.pressureCallbacks.push(callback);
    }

    /**
     * Starts periodic resource monitoring.
     *
     * While monitoring is active, the monitor will periodically check
     * resource state and invoke memory pressure callbacks as needed.
     */
    public startMonitoring(): void {
        // Avoid duplicate monitoring intervals
        if (this.isMonitoring) {
            if (VERBOSE) logger("Monitoring already active, skipping start");
            return;
        }

        this.isMonitoring = true;
        if (VERBOSE) logger("Starting resource monitoring");

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
    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (VERBOSE) logger("Stopping resource monitoring");

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
    private checkResources(): void {
        const snapshot = this.getSnapshot();

        // Add to rolling samples for smoothing
        this.memorySamples.push(snapshot.freeMemory);
        if (this.memorySamples.length > MEMORY_SAMPLE_COUNT) {
            this.memorySamples.shift();
        }

        // Calculate smoothed average
        const averageFreeMemory =
            this.memorySamples.reduce((a, b) => a + b, 0) /
            this.memorySamples.length;

        // Check for sustained memory pressure
        if (averageFreeMemory < MIN_AVAILABLE_MEMORY_BYTES) {
            logger(
                `Memory pressure detected: ${Math.round(averageFreeMemory / (1024 * 1024))}MB average free`,
            );

            // Invoke all registered callbacks
            for (const callback of this.pressureCallbacks) {
                try {
                    callback(snapshot);
                } catch (err) {
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
    public tryForceGC(): boolean {
        // Check if gc() is exposed (requires --expose-gc V8 flag)
        // biome-ignore lint/suspicious/noExplicitAny: Accessing global gc() which may not exist
        if (typeof (global as any).gc === "function") {
            if (VERBOSE) logger("Forcing garbage collection");
            // biome-ignore lint/suspicious/noExplicitAny: Accessing global gc() which may not exist
            (global as any).gc();
            return true;
        }

        if (VERBOSE)
            logger("Garbage collection not available (run with --expose-gc)");
        return false;
    }

    /**
     * Logs a detailed resource report for debugging.
     */
    public logResourceReport(): void {
        const snapshot = this.getSnapshot();

        const formatMB = (bytes: number): string =>
            `${Math.round(bytes / (1024 * 1024))}MB`;

        if (VERBOSE) logger("=== Resource Report ===");
        if (VERBOSE)
            logger(`Total Memory:     ${formatMB(snapshot.totalMemory)}`);
        if (VERBOSE)
            logger(`Free Memory:      ${formatMB(snapshot.freeMemory)}`);
        if (VERBOSE)
            logger(`Process RSS:      ${formatMB(snapshot.processMemory)}`);
        if (VERBOSE) logger(`Heap Used:        ${formatMB(snapshot.heapUsed)}`);
        if (VERBOSE)
            logger(`Heap Total:       ${formatMB(snapshot.heapTotal)}`);
        if (VERBOSE) logger(`CPU Cores:        ${snapshot.cpuCount}`);
        if (VERBOSE)
            logger(`Optimal Chunk:    ${snapshot.optimalChunkSizeMB}MB`);
        if (VERBOSE) logger(`Memory Pressure:  ${snapshot.memoryPressure}`);
        if (VERBOSE) logger("========================");
    }
}

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
export const getOptimalChunkSize = (): number => {
    return ResourceMonitor.getInstance().getSnapshot().optimalChunkSizeMB;
};

/**
 * Gets the current optimal concurrency level for parallel operations.
 *
 * @returns Recommended number of concurrent operations.
 */
export const getOptimalConcurrency = (): number => {
    return ResourceMonitor.getInstance().getOptimalConcurrency();
};

/**
 * Checks if the system is currently under memory pressure.
 *
 * @returns True if memory pressure is detected.
 */
export const isMemoryPressure = (): boolean => {
    return ResourceMonitor.getInstance().getSnapshot().memoryPressure;
};

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
export const waitForMemory = async (
    checkIntervalMs = 1000,
    maxWaitMs = 30000,
): Promise<void> => {
    const startTime = Date.now();

    while (isMemoryPressure()) {
        // Check if we've exceeded maximum wait time
        if (Date.now() - startTime > maxWaitMs) {
            logger(
                `Memory wait timeout (${maxWaitMs}ms), proceeding despite pressure`,
            );
            break;
        }

        // Try to force GC to reclaim memory
        ResourceMonitor.getInstance().tryForceGC();

        // Wait before checking again
        if (VERBOSE) logger(`Waiting for memory (${checkIntervalMs}ms)...`);
        await new Promise<void>((resolve) =>
            setTimeout(resolve, checkIntervalMs),
        );
    }
};
