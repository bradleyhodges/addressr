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
/**
 * Possible states of the circuit breaker.
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
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
export declare class CircuitOpenError extends Error {
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
    constructor(circuitName: string, retryAfterMs: number);
}
/**
 * Circuit breaker for wrapping async operations with failure protection.
 *
 * The circuit breaker monitors operation success/failure rates and opens
 * (fails fast) when too many failures occur. This prevents cascading
 * failures and gives the downstream service time to recover.
 */
export declare class CircuitBreaker {
    /** Current state of the circuit */
    private state;
    /** Configuration for this circuit breaker */
    private config;
    /** Rolling window of recent operations */
    private operationHistory;
    /** Count of consecutive successes in half-open state */
    private halfOpenSuccesses;
    /** Timestamp when the circuit was opened */
    private openedAt;
    /** Timestamp when the circuit was last closed */
    private closedAt;
    /** Total rejection count for statistics */
    private totalRejections;
    /** Handle for the reset timeout */
    private resetTimeout;
    /**
     * Creates a new circuit breaker with the specified configuration.
     *
     * @param config - Partial configuration to override defaults.
     */
    constructor(config?: Partial<CircuitBreakerConfig>);
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
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Determines if an operation can be executed based on circuit state.
     *
     * @returns True if the operation should be allowed.
     */
    private canExecute;
    /**
     * Records a successful operation and updates circuit state.
     *
     * @param durationMs - Duration of the operation in milliseconds.
     */
    private recordSuccess;
    /**
     * Records a failed operation and updates circuit state.
     *
     * @param durationMs - Duration of the operation in milliseconds.
     * @param errorMessage - Error message from the failure.
     */
    private recordFailure;
    /**
     * Gets the count of failures in the current sliding window.
     *
     * @returns Number of failures in the window.
     */
    private getRecentFailureCount;
    /**
     * Removes operations outside the sliding window.
     */
    private pruneOperationHistory;
    /**
     * Checks if enough time has passed to attempt recovery.
     *
     * @returns True if reset timeout has elapsed.
     */
    private shouldAttemptReset;
    /**
     * Gets the time in ms until a retry should be attempted.
     *
     * @returns Milliseconds until retry.
     */
    private getRetryAfterMs;
    /**
     * Transitions the circuit to OPEN state.
     */
    private transitionToOpen;
    /**
     * Transitions the circuit to HALF_OPEN state.
     */
    private transitionToHalfOpen;
    /**
     * Transitions the circuit to CLOSED state.
     */
    private transitionToClosed;
    /**
     * Gets the current state of the circuit.
     *
     * @returns The current circuit state.
     */
    getState(): CircuitState;
    /**
     * Gets comprehensive statistics about the circuit breaker.
     *
     * @returns Statistics object.
     */
    getStats(): CircuitBreakerStats;
    /**
     * Manually resets the circuit to CLOSED state.
     *
     * Use this for administrative recovery when you know the
     * downstream service is healthy.
     */
    reset(): void;
    /**
     * Cleans up resources used by the circuit breaker.
     */
    destroy(): void;
}
/**
 * Gets the singleton circuit breaker for OpenSearch operations.
 *
 * The circuit breaker is lazily initialized on first access with
 * configuration from environment variables if available.
 *
 * @returns The singleton OpenSearch circuit breaker.
 */
export declare const getOpenSearchCircuit: () => CircuitBreaker;
/**
 * Resets the singleton OpenSearch circuit breaker (primarily for testing).
 */
export declare const resetOpenSearchCircuit: () => void;
//# sourceMappingURL=circuitBreaker.d.ts.map