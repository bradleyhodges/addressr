/**
 * Circuit breaker pattern implementation for OpenSearch operations.
 *
 * This module implements the circuit breaker pattern to prevent cascading
 * failures when OpenSearch becomes unavailable or experiences issues. It
 * provides automatic failure detection, recovery, and graceful degradation.
 *
 * Circuit States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold exceeded, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 *
 * @module circuitBreaker
 */

import debug from "debug";
import { VERBOSE } from "../config";

// ---------------------------------------------------------------------------------
// Debug Loggers
// ---------------------------------------------------------------------------------

/** Logger for circuit breaker operations */
const logger = debug("api:circuit");

/** Logger for circuit breaker errors */
const error = debug("error:circuit");

// ---------------------------------------------------------------------------------
// Circuit Breaker Configuration
// ---------------------------------------------------------------------------------

/**
 * Default failure threshold before opening the circuit.
 *
 * @constant
 */
const DEFAULT_FAILURE_THRESHOLD = 5;

/**
 * Default time in milliseconds before attempting to close the circuit.
 *
 * @constant
 */
const DEFAULT_RESET_TIMEOUT_MS = 30000;

/**
 * Default number of successful requests needed to close the circuit from half-open.
 *
 * @constant
 */
const DEFAULT_SUCCESS_THRESHOLD = 3;

/**
 * Default sliding window duration for tracking failures.
 *
 * @constant
 */
const DEFAULT_WINDOW_MS = 60000;

// ---------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------

/**
 * Possible states of the circuit breaker.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Record of a single operation result for tracking.
 */
type OperationRecord = {
    /** Timestamp of the operation */
    timestamp: number;
    /** Whether the operation succeeded */
    success: boolean;
    /** Duration of the operation in ms */
    durationMs: number;
    /** Error message if failed */
    errorMessage?: string;
};

/**
 * Configuration options for the circuit breaker.
 */
export type CircuitBreakerConfig = {
    /** Number of failures before opening the circuit */
    failureThreshold: number;
    /** Time in ms before attempting recovery */
    resetTimeoutMs: number;
    /** Number of successes needed to close from half-open */
    successThreshold: number;
    /** Duration of the sliding window for failure tracking */
    windowMs: number;
    /** Name identifier for this circuit (for logging) */
    name: string;
};

/**
 * Statistics about circuit breaker performance.
 */
export type CircuitBreakerStats = {
    /** Current state of the circuit */
    state: CircuitState;
    /** Total number of successful operations */
    successes: number;
    /** Total number of failed operations */
    failures: number;
    /** Number of requests rejected due to open circuit */
    rejections: number;
    /** Timestamp when the circuit last opened */
    lastOpenedAt: number | undefined;
    /** Timestamp when the circuit last closed */
    lastClosedAt: number | undefined;
    /** Current failure count in the sliding window */
    currentFailureCount: number;
    /** Average response time of successful operations */
    averageResponseTimeMs: number;
};

/**
 * Error thrown when the circuit breaker rejects a request.
 */
export class CircuitOpenError extends Error {
    /** The name of the circuit that rejected the request */
    readonly circuitName: string;
    /** Time in ms until the circuit will attempt recovery */
    readonly retryAfterMs: number;

    /**
     * Creates a new CircuitOpenError.
     *
     * @param circuitName - Name of the circuit that is open.
     * @param retryAfterMs - Time until recovery attempt.
     */
    constructor(circuitName: string, retryAfterMs: number) {
        super(
            `Circuit '${circuitName}' is OPEN. Service unavailable. Retry after ${retryAfterMs}ms.`,
        );
        this.name = "CircuitOpenError";
        this.circuitName = circuitName;
        this.retryAfterMs = retryAfterMs;
    }
}

// ---------------------------------------------------------------------------------
// Circuit Breaker Implementation
// ---------------------------------------------------------------------------------

/**
 * Circuit breaker for wrapping async operations with failure protection.
 *
 * The circuit breaker monitors operation success/failure rates and opens
 * (fails fast) when too many failures occur. This prevents cascading
 * failures and gives the downstream service time to recover.
 */
export class CircuitBreaker {
    /** Current state of the circuit */
    private state: CircuitState = "CLOSED";

    /** Configuration for this circuit breaker */
    private config: CircuitBreakerConfig;

    /** Rolling window of recent operations */
    private operationHistory: OperationRecord[] = [];

    /** Count of consecutive successes in half-open state */
    private halfOpenSuccesses = 0;

    /** Timestamp when the circuit was opened */
    private openedAt: number | undefined;

    /** Timestamp when the circuit was last closed */
    private closedAt: number | undefined;

    /** Total rejection count for statistics */
    private totalRejections = 0;

    /** Handle for the reset timeout */
    private resetTimeout: NodeJS.Timeout | undefined;

    /**
     * Creates a new circuit breaker with the specified configuration.
     *
     * @param config - Partial configuration to override defaults.
     */
    constructor(config?: Partial<CircuitBreakerConfig>) {
        // Merge provided config with defaults
        this.config = {
            failureThreshold:
                config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
            resetTimeoutMs: config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS,
            successThreshold:
                config?.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD,
            windowMs: config?.windowMs ?? DEFAULT_WINDOW_MS,
            name: config?.name ?? "default",
        };

        logger(
            `Circuit breaker '${this.config.name}' initialized:`,
            this.config,
        );
    }

    /**
     * Executes an async operation with circuit breaker protection.
     *
     * If the circuit is open, the operation is rejected immediately.
     * If the circuit is closed or half-open, the operation is executed
     * and its result is tracked for circuit state decisions.
     *
     * @template T - The return type of the operation.
     * @param operation - The async operation to execute.
     * @returns The result of the operation.
     * @throws {CircuitOpenError} If the circuit is open.
     * @throws {Error} If the operation fails and the circuit is not open.
     */
    public async execute<T>(operation: () => Promise<T>): Promise<T> {
        // Check if we should allow the request
        if (!this.canExecute()) {
            const retryAfter = this.getRetryAfterMs();
            this.totalRejections++;
            logger(
                `Circuit '${this.config.name}' REJECTED request (state: ${this.state})`,
            );
            throw new CircuitOpenError(this.config.name, retryAfter);
        }

        // Track operation timing
        const startTime = Date.now();

        try {
            // Execute the operation
            const result = await operation();

            // Record success
            this.recordSuccess(Date.now() - startTime);

            return result;
        } catch (err) {
            // Record failure
            this.recordFailure(
                Date.now() - startTime,
                err instanceof Error ? err.message : String(err),
            );

            // Re-throw the original error
            throw err;
        }
    }

    /**
     * Determines if an operation can be executed based on circuit state.
     *
     * @returns True if the operation should be allowed.
     */
    private canExecute(): boolean {
        // Prune old operations outside the window
        this.pruneOperationHistory();

        switch (this.state) {
            case "CLOSED":
                // Normal operation - allow all requests
                return true;

            case "OPEN":
                // Check if reset timeout has elapsed
                if (this.shouldAttemptReset()) {
                    this.transitionToHalfOpen();
                    return true;
                }
                // Still open - reject
                return false;

            case "HALF_OPEN":
                // Allow limited requests to test recovery
                return true;

            default:
                return false;
        }
    }

    /**
     * Records a successful operation and updates circuit state.
     *
     * @param durationMs - Duration of the operation in milliseconds.
     */
    private recordSuccess(durationMs: number): void {
        // Add to operation history
        this.operationHistory.push({
            timestamp: Date.now(),
            success: true,
            durationMs,
        });

        logger(
            `Circuit '${this.config.name}' operation SUCCESS (${durationMs}ms)`,
        );

        // Update state based on current state
        if (this.state === "HALF_OPEN") {
            this.halfOpenSuccesses++;

            // Check if we've reached the success threshold
            if (this.halfOpenSuccesses >= this.config.successThreshold) {
                this.transitionToClosed();
            }
        }
    }

    /**
     * Records a failed operation and updates circuit state.
     *
     * @param durationMs - Duration of the operation in milliseconds.
     * @param errorMessage - Error message from the failure.
     */
    private recordFailure(durationMs: number, errorMessage: string): void {
        // Add to operation history
        this.operationHistory.push({
            timestamp: Date.now(),
            success: false,
            durationMs,
            errorMessage,
        });

        error(
            `Circuit '${this.config.name}' operation FAILED: ${errorMessage}`,
        );

        // Update state based on current state
        if (this.state === "HALF_OPEN") {
            // A single failure in half-open state reopens the circuit
            this.transitionToOpen();
        } else if (this.state === "CLOSED") {
            // Check if failure threshold is exceeded
            const recentFailures = this.getRecentFailureCount();
            if (recentFailures >= this.config.failureThreshold) {
                this.transitionToOpen();
            }
        }
    }

    /**
     * Gets the count of failures in the current sliding window.
     *
     * @returns Number of failures in the window.
     */
    private getRecentFailureCount(): number {
        return this.operationHistory.filter((op) => !op.success).length;
    }

    /**
     * Removes operations outside the sliding window.
     */
    private pruneOperationHistory(): void {
        const cutoff = Date.now() - this.config.windowMs;
        this.operationHistory = this.operationHistory.filter(
            (op) => op.timestamp >= cutoff,
        );
    }

    /**
     * Checks if enough time has passed to attempt recovery.
     *
     * @returns True if reset timeout has elapsed.
     */
    private shouldAttemptReset(): boolean {
        if (this.openedAt === undefined) {
            return false;
        }
        return Date.now() - this.openedAt >= this.config.resetTimeoutMs;
    }

    /**
     * Gets the time in ms until a retry should be attempted.
     *
     * @returns Milliseconds until retry.
     */
    private getRetryAfterMs(): number {
        if (this.openedAt === undefined) {
            return 0;
        }
        const elapsed = Date.now() - this.openedAt;
        return Math.max(0, this.config.resetTimeoutMs - elapsed);
    }

    /**
     * Transitions the circuit to OPEN state.
     */
    private transitionToOpen(): void {
        const previousState = this.state;
        this.state = "OPEN";
        this.openedAt = Date.now();
        this.halfOpenSuccesses = 0;

        // Clear any existing reset timeout
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
        }

        // Schedule transition to half-open
        this.resetTimeout = setTimeout(() => {
            this.transitionToHalfOpen();
        }, this.config.resetTimeoutMs);

        // Prevent timeout from keeping the process alive
        this.resetTimeout.unref();

        logger(
            `Circuit '${this.config.name}' transitioned ${previousState} -> OPEN`,
        );
    }

    /**
     * Transitions the circuit to HALF_OPEN state.
     */
    private transitionToHalfOpen(): void {
        const previousState = this.state;
        this.state = "HALF_OPEN";
        this.halfOpenSuccesses = 0;

        logger(
            `Circuit '${this.config.name}' transitioned ${previousState} -> HALF_OPEN`,
        );
    }

    /**
     * Transitions the circuit to CLOSED state.
     */
    private transitionToClosed(): void {
        const previousState = this.state;
        this.state = "CLOSED";
        this.closedAt = Date.now();
        this.halfOpenSuccesses = 0;

        // Clear any reset timeout
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }

        logger(
            `Circuit '${this.config.name}' transitioned ${previousState} -> CLOSED`,
        );
    }

    /**
     * Gets the current state of the circuit.
     *
     * @returns The current circuit state.
     */
    public getState(): CircuitState {
        return this.state;
    }

    /**
     * Gets comprehensive statistics about the circuit breaker.
     *
     * @returns Statistics object.
     */
    public getStats(): CircuitBreakerStats {
        this.pruneOperationHistory();

        const successes = this.operationHistory.filter((op) => op.success);
        const failures = this.operationHistory.filter((op) => !op.success);

        const totalSuccessDuration = successes.reduce(
            (sum, op) => sum + op.durationMs,
            0,
        );
        const averageResponseTimeMs =
            successes.length > 0 ? totalSuccessDuration / successes.length : 0;

        return {
            state: this.state,
            successes: successes.length,
            failures: failures.length,
            rejections: this.totalRejections,
            lastOpenedAt: this.openedAt,
            lastClosedAt: this.closedAt,
            currentFailureCount: failures.length,
            averageResponseTimeMs: Math.round(averageResponseTimeMs),
        };
    }

    /**
     * Manually resets the circuit to CLOSED state.
     *
     * Use this for administrative recovery when you know the
     * downstream service is healthy.
     */
    public reset(): void {
        const previousState = this.state;

        // Clear timeout
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }

        // Reset all state
        this.state = "CLOSED";
        this.operationHistory = [];
        this.halfOpenSuccesses = 0;
        this.openedAt = undefined;
        this.closedAt = Date.now();

        logger(
            `Circuit '${this.config.name}' manually reset from ${previousState}`,
        );
    }

    /**
     * Cleans up resources used by the circuit breaker.
     */
    public destroy(): void {
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }
        this.operationHistory = [];
        if (VERBOSE) logger(`Circuit '${this.config.name}' destroyed`);
    }
}

// ---------------------------------------------------------------------------------
// Singleton Circuit Breaker for OpenSearch
// ---------------------------------------------------------------------------------

/**
 * Singleton circuit breaker instance for OpenSearch operations.
 */
let opensearchCircuit: CircuitBreaker | undefined;

/**
 * Gets the singleton circuit breaker for OpenSearch operations.
 *
 * The circuit breaker is lazily initialized on first access with
 * configuration from environment variables if available.
 *
 * @returns The singleton OpenSearch circuit breaker.
 */
export const getOpenSearchCircuit = (): CircuitBreaker => {
    if (opensearchCircuit === undefined) {
        // Parse configuration from environment
        const failureThreshold = Number.parseInt(
            process.env.ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD ?? "5",
            10,
        );
        const resetTimeoutMs = Number.parseInt(
            process.env.ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS ?? "30000",
            10,
        );
        const successThreshold = Number.parseInt(
            process.env.ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD ?? "3",
            10,
        );

        opensearchCircuit = new CircuitBreaker({
            name: "opensearch",
            failureThreshold,
            resetTimeoutMs,
            successThreshold,
        });
    }

    return opensearchCircuit;
};

/**
 * Resets the singleton OpenSearch circuit breaker (primarily for testing).
 */
export const resetOpenSearchCircuit = (): void => {
    if (opensearchCircuit !== undefined) {
        opensearchCircuit.destroy();
        opensearchCircuit = undefined;
    }
};
