"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetOpenSearchCircuit = exports.getOpenSearchCircuit = exports.CircuitBreaker = exports.CircuitOpenError = void 0;
const debug_1 = require("debug");
// ---------------------------------------------------------------------------------
// Debug Loggers
// ---------------------------------------------------------------------------------
/** Logger for circuit breaker operations */
const logger = (0, debug_1.default)("api:circuit");
/** Logger for circuit breaker errors */
const error = (0, debug_1.default)("error:circuit");
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
/**
 * Error thrown when the circuit breaker rejects a request.
 */
class CircuitOpenError extends Error {
    /** The name of the circuit that rejected the request */
    circuitName;
    /** Time in ms until the circuit will attempt recovery */
    retryAfterMs;
    /**
     * Creates a new CircuitOpenError.
     *
     * @param circuitName - Name of the circuit that is open.
     * @param retryAfterMs - Time until recovery attempt.
     */
    constructor(circuitName, retryAfterMs) {
        super(`Circuit '${circuitName}' is OPEN. Service unavailable. Retry after ${retryAfterMs}ms.`);
        this.name = "CircuitOpenError";
        this.circuitName = circuitName;
        this.retryAfterMs = retryAfterMs;
    }
}
exports.CircuitOpenError = CircuitOpenError;
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
class CircuitBreaker {
    /** Current state of the circuit */
    state = "CLOSED";
    /** Configuration for this circuit breaker */
    config;
    /** Rolling window of recent operations */
    operationHistory = [];
    /** Count of consecutive successes in half-open state */
    halfOpenSuccesses = 0;
    /** Timestamp when the circuit was opened */
    openedAt;
    /** Timestamp when the circuit was last closed */
    closedAt;
    /** Total rejection count for statistics */
    totalRejections = 0;
    /** Handle for the reset timeout */
    resetTimeout;
    /**
     * Creates a new circuit breaker with the specified configuration.
     *
     * @param config - Partial configuration to override defaults.
     */
    constructor(config) {
        // Merge provided config with defaults
        this.config = {
            failureThreshold: config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
            resetTimeoutMs: config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS,
            successThreshold: config?.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD,
            windowMs: config?.windowMs ?? DEFAULT_WINDOW_MS,
            name: config?.name ?? "default",
        };
        logger(`Circuit breaker '${this.config.name}' initialized:`, this.config);
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
    async execute(operation) {
        // Check if we should allow the request
        if (!this.canExecute()) {
            const retryAfter = this.getRetryAfterMs();
            this.totalRejections++;
            logger(`Circuit '${this.config.name}' REJECTED request (state: ${this.state})`);
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
        }
        catch (err) {
            // Record failure
            this.recordFailure(Date.now() - startTime, err instanceof Error ? err.message : String(err));
            // Re-throw the original error
            throw err;
        }
    }
    /**
     * Determines if an operation can be executed based on circuit state.
     *
     * @returns True if the operation should be allowed.
     */
    canExecute() {
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
    recordSuccess(durationMs) {
        // Add to operation history
        this.operationHistory.push({
            timestamp: Date.now(),
            success: true,
            durationMs,
        });
        logger(`Circuit '${this.config.name}' operation SUCCESS (${durationMs}ms)`);
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
    recordFailure(durationMs, errorMessage) {
        // Add to operation history
        this.operationHistory.push({
            timestamp: Date.now(),
            success: false,
            durationMs,
            errorMessage,
        });
        error(`Circuit '${this.config.name}' operation FAILED: ${errorMessage}`);
        // Update state based on current state
        if (this.state === "HALF_OPEN") {
            // A single failure in half-open state reopens the circuit
            this.transitionToOpen();
        }
        else if (this.state === "CLOSED") {
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
    getRecentFailureCount() {
        return this.operationHistory.filter((op) => !op.success).length;
    }
    /**
     * Removes operations outside the sliding window.
     */
    pruneOperationHistory() {
        const cutoff = Date.now() - this.config.windowMs;
        this.operationHistory = this.operationHistory.filter((op) => op.timestamp >= cutoff);
    }
    /**
     * Checks if enough time has passed to attempt recovery.
     *
     * @returns True if reset timeout has elapsed.
     */
    shouldAttemptReset() {
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
    getRetryAfterMs() {
        if (this.openedAt === undefined) {
            return 0;
        }
        const elapsed = Date.now() - this.openedAt;
        return Math.max(0, this.config.resetTimeoutMs - elapsed);
    }
    /**
     * Transitions the circuit to OPEN state.
     */
    transitionToOpen() {
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
        logger(`Circuit '${this.config.name}' transitioned ${previousState} -> OPEN`);
    }
    /**
     * Transitions the circuit to HALF_OPEN state.
     */
    transitionToHalfOpen() {
        const previousState = this.state;
        this.state = "HALF_OPEN";
        this.halfOpenSuccesses = 0;
        logger(`Circuit '${this.config.name}' transitioned ${previousState} -> HALF_OPEN`);
    }
    /**
     * Transitions the circuit to CLOSED state.
     */
    transitionToClosed() {
        const previousState = this.state;
        this.state = "CLOSED";
        this.closedAt = Date.now();
        this.halfOpenSuccesses = 0;
        // Clear any reset timeout
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }
        logger(`Circuit '${this.config.name}' transitioned ${previousState} -> CLOSED`);
    }
    /**
     * Gets the current state of the circuit.
     *
     * @returns The current circuit state.
     */
    getState() {
        return this.state;
    }
    /**
     * Gets comprehensive statistics about the circuit breaker.
     *
     * @returns Statistics object.
     */
    getStats() {
        this.pruneOperationHistory();
        const successes = this.operationHistory.filter((op) => op.success);
        const failures = this.operationHistory.filter((op) => !op.success);
        const totalSuccessDuration = successes.reduce((sum, op) => sum + op.durationMs, 0);
        const averageResponseTimeMs = successes.length > 0 ? totalSuccessDuration / successes.length : 0;
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
    reset() {
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
        logger(`Circuit '${this.config.name}' manually reset from ${previousState}`);
    }
    /**
     * Cleans up resources used by the circuit breaker.
     */
    destroy() {
        if (this.resetTimeout !== undefined) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }
        this.operationHistory = [];
        logger(`Circuit '${this.config.name}' destroyed`);
    }
}
exports.CircuitBreaker = CircuitBreaker;
// ---------------------------------------------------------------------------------
// Singleton Circuit Breaker for OpenSearch
// ---------------------------------------------------------------------------------
/**
 * Singleton circuit breaker instance for OpenSearch operations.
 */
let opensearchCircuit;
/**
 * Gets the singleton circuit breaker for OpenSearch operations.
 *
 * The circuit breaker is lazily initialized on first access with
 * configuration from environment variables if available.
 *
 * @returns The singleton OpenSearch circuit breaker.
 */
const getOpenSearchCircuit = () => {
    if (opensearchCircuit === undefined) {
        // Parse configuration from environment
        const failureThreshold = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_FAILURE_THRESHOLD ?? "5", 10);
        const resetTimeoutMs = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_RESET_TIMEOUT_MS ?? "30000", 10);
        const successThreshold = Number.parseInt(process.env.ADDRESSKIT_CIRCUIT_SUCCESS_THRESHOLD ?? "3", 10);
        opensearchCircuit = new CircuitBreaker({
            name: "opensearch",
            failureThreshold,
            resetTimeoutMs,
            successThreshold,
        });
    }
    return opensearchCircuit;
};
exports.getOpenSearchCircuit = getOpenSearchCircuit;
/**
 * Resets the singleton OpenSearch circuit breaker (primarily for testing).
 */
const resetOpenSearchCircuit = () => {
    if (opensearchCircuit !== undefined) {
        opensearchCircuit.destroy();
        opensearchCircuit = undefined;
    }
};
exports.resetOpenSearchCircuit = resetOpenSearchCircuit;
//# sourceMappingURL=circuitBreaker.js.map