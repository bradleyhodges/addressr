"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DownloadError = void 0;
exports.default = streamDown;
const fs = __importStar(require("node:fs"));
const node_https_1 = require("node:https");
const path = __importStar(require("node:path"));
const node_url_1 = require("node:url");
/**
 * Custom error class for download failures with retry context.
 */
class DownloadError extends Error {
    /** The underlying error code (e.g., ECONNRESET, ETIMEDOUT) */
    code;
    /** Number of retry attempts made before giving up */
    attempts;
    /** Whether this error is retryable */
    isRetryable;
    /** Bytes downloaded before the failure */
    bytesDownloaded;
    /**
     * Creates a new DownloadError.
     *
     * @param message - Human-readable error description.
     * @param code - Error code from the underlying error.
     * @param attempts - Number of retry attempts made.
     * @param isRetryable - Whether the error could be retried.
     * @param bytesDownloaded - Bytes downloaded before failure.
     */
    constructor(message, code, attempts = 0, isRetryable = false, bytesDownloaded = 0) {
        super(message);
        this.name = "DownloadError";
        this.code = code;
        this.attempts = attempts;
        this.isRetryable = isRetryable;
        this.bytesDownloaded = bytesDownloaded;
    }
}
exports.DownloadError = DownloadError;
/**
 * Error codes that indicate transient network issues worth retrying.
 */
const RETRYABLE_ERROR_CODES = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "EPIPE",
    "EAI_AGAIN",
    "EPROTO",
    "SOCKET_TIMEOUT",
    "CONNECT_TIMEOUT",
    "DATA_OVERFLOW", // Received more data than expected - likely corrupt stream
    "SIZE_MISMATCH", // Final file size doesn't match expected - retry from scratch
]);
/**
 * HTTP status codes that indicate transient server issues worth retrying.
 */
const RETRYABLE_HTTP_STATUS_CODES = new Set([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
]);
/**
 * HTTP status codes that indicate the partial file is corrupt and must be deleted.
 * HTTP 416 means the Range header requested bytes beyond the file size.
 */
const CORRUPT_FILE_HTTP_STATUS_CODES = new Set([
    416, // Range Not Satisfiable - partial file is larger than or misaligned with remote
]);
/**
 * Determines if an error is retryable based on its code or message.
 *
 * @param error - The error to evaluate.
 * @returns True if the error is worth retrying.
 */
function isRetryableError(error) {
    // Check error code directly
    if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) {
        return true;
    }
    // Check error message for common patterns
    const message = error.message.toLowerCase();
    if (message.includes("econnreset") ||
        message.includes("socket hang up") ||
        message.includes("connection reset") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("aborted")) {
        return true;
    }
    return false;
}
/**
 * Calculates the backoff delay for a retry attempt using exponential backoff with jitter.
 *
 * @param attempt - The current retry attempt (0-based).
 * @param initialBackoff - Initial backoff delay in milliseconds.
 * @param maxBackoff - Maximum backoff delay in milliseconds.
 * @param multiplier - Backoff multiplier for exponential growth.
 * @returns The delay in milliseconds before the next retry.
 */
function calculateBackoff(attempt, initialBackoff, maxBackoff, multiplier) {
    // Exponential backoff: initialBackoff * (multiplier ^ attempt)
    const exponentialDelay = initialBackoff * multiplier ** attempt;
    // Cap at maximum backoff
    const cappedDelay = Math.min(exponentialDelay, maxBackoff);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(cappedDelay + jitter);
}
/**
 * Waits for a specified duration.
 *
 * @param ms - Duration to wait in milliseconds.
 * @returns A promise that resolves after the specified duration.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Gets the size of an existing file, returning 0 if the file doesn't exist.
 *
 * @param {string} filePath - Path to the file.
 * @returns {number} Size of the file in bytes, or 0 if not found.
 */
function getExistingFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    }
    catch {
        return 0;
    }
}
/**
 * Safely deletes a file if it exists.
 *
 * @param {string} filePath - Path to the file to delete.
 * @returns {boolean} True if the file was deleted, false if it didn't exist or couldn't be deleted.
 */
function safeDeleteFile(filePath) {
    try {
        fs.unlinkSync(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validates an existing partial file before attempting resume.
 * Returns the size to use for resume, or 0 if the file should be deleted and restarted.
 *
 * @param {string} filePath - Path to the partial file.
 * @param {number} expectedSize - Expected total file size (0 if unknown).
 * @returns {{ resumeFromBytes: number; wasDeleted: boolean }} Resume info.
 */
function validatePartialFile(filePath, expectedSize) {
    const existingSize = getExistingFileSize(filePath);
    // No existing file - start fresh
    if (existingSize === 0) {
        return { resumeFromBytes: 0, wasDeleted: false };
    }
    // If we don't know the expected size, trust the existing file
    if (expectedSize <= 0) {
        return { resumeFromBytes: existingSize, wasDeleted: false };
    }
    // If existing file is larger than or equal to expected, it's likely corrupt or complete
    // Delete and start fresh to avoid HTTP 416 errors
    if (existingSize >= expectedSize) {
        safeDeleteFile(filePath);
        return { resumeFromBytes: 0, wasDeleted: true };
    }
    // Partial file is valid for resume
    return { resumeFromBytes: existingSize, wasDeleted: false };
}
/**
 * Performs a single download attempt with timeout support.
 *
 * @param opts - Download options.
 * @param existingSize - Size of existing partial file (for resume).
 * @param retryAttempt - Current retry attempt number.
 * @returns Promise resolving to the response when download completes.
 */
function attemptDownload(opts, existingSize, retryAttempt) {
    // Parse the URL using the modern WHATWG URL API
    const uri = new node_url_1.URL(opts.url);
    // Resolve the destination path to a file name
    const resolvedDestination = opts.destinationPath ?? path.basename(uri.pathname ?? opts.url);
    // Timeout configuration with defaults
    const socketTimeout = opts.timeout?.socketTimeout ?? 300000;
    const connectTimeout = opts.timeout?.connectTimeout ?? 300000;
    const isResuming = existingSize > 0;
    // Notify about incomplete file detection
    if (isResuming && opts.onIncompleteDetected && opts.expectedSize) {
        opts.onIncompleteDetected(existingSize, opts.expectedSize);
    }
    // Create write stream with append flag if resuming
    const file = fs.createWriteStream(resolvedDestination, {
        flags: isResuming ? "a" : "w",
    });
    // Progress tracking state
    const progressInterval = opts.progressInterval ?? 100;
    return new Promise((resolve, reject) => {
        // Track if the request has been aborted
        let aborted = false;
        let connectTimeoutId;
        let socketTimeoutId;
        /**
         * Cleanup function to clear timeouts and close resources.
         */
        const cleanup = () => {
            if (connectTimeoutId) {
                clearTimeout(connectTimeoutId);
                connectTimeoutId = undefined;
            }
            if (socketTimeoutId) {
                clearTimeout(socketTimeoutId);
                socketTimeoutId = undefined;
            }
        };
        /**
         * Abort the request with an error.
         */
        const abortWithError = (error) => {
            if (aborted)
                return;
            aborted = true;
            cleanup();
            file.close();
            reject(error);
        };
        // Build request options with Range header for resume
        const requestOptions = {
            timeout: connectTimeout,
        };
        if (isResuming) {
            requestOptions.headers = {
                Range: `bytes=${existingSize}-`,
            };
        }
        // Set connection timeout
        connectTimeoutId = setTimeout(() => {
            const error = new Error(`Connection timeout after ${connectTimeout}ms`);
            error.code = "CONNECT_TIMEOUT";
            abortWithError(error);
        }, connectTimeout);
        // Get the response from the URL
        const req = (0, node_https_1.get)(uri.href, requestOptions, (response) => {
            // Clear connection timeout - we're connected
            if (connectTimeoutId) {
                clearTimeout(connectTimeoutId);
                connectTimeoutId = undefined;
            }
            // Handle redirects (3xx status codes)
            if (response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location) {
                // Follow the redirect
                cleanup();
                file.close();
                // Only delete if not resuming, otherwise we lose progress
                if (!isResuming) {
                    try {
                        fs.unlinkSync(resolvedDestination);
                    }
                    catch {
                        // File may not exist yet
                    }
                }
                attemptDownload({
                    ...opts,
                    url: response.headers.location,
                }, existingSize, retryAttempt)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            // Check for HTTP 416 (Range Not Satisfiable) - indicates corrupt partial file
            // This requires special handling: delete the partial file and signal restart
            if (response.statusCode === 416 &&
                CORRUPT_FILE_HTTP_STATUS_CODES.has(response.statusCode)) {
                cleanup();
                file.close();
                // Delete the corrupt partial file
                safeDeleteFile(resolvedDestination);
                // Create a special error that signals we should restart from scratch
                const error = new Error("HTTP 416: Range Not Satisfiable - partial file was corrupt, deleted and will restart");
                error.code = "HTTP_416_RESTART";
                error.requiresRestart = true;
                reject(error);
                return;
            }
            // Check for retryable HTTP errors
            if (response.statusCode &&
                RETRYABLE_HTTP_STATUS_CODES.has(response.statusCode)) {
                const error = new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
                error.code = `HTTP_${response.statusCode}`;
                error.statusCode = response.statusCode;
                cleanup();
                file.close();
                reject(error);
                return;
            }
            // Check for non-success status codes
            if (response.statusCode && response.statusCode >= 400) {
                const error = new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
                error.code = `HTTP_${response.statusCode}`;
                cleanup();
                file.close();
                reject(error);
                return;
            }
            // Check if server supports resume (206 Partial Content)
            const serverSupportsResume = response.statusCode === 206;
            // If we tried to resume but server doesn't support it, restart from beginning
            if (isResuming &&
                !serverSupportsResume &&
                response.statusCode === 200) {
                cleanup();
                file.close();
                // Delete the partial file and start fresh
                try {
                    fs.unlinkSync(resolvedDestination);
                }
                catch {
                    // Ignore deletion errors
                }
                // Retry without resume
                attemptDownload({
                    ...opts,
                    enableResume: false,
                }, 0, retryAttempt)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            // Get the content length header
            const contentLengthHeader = response.headers["content-length"];
            // Calculate total bytes - for resumed downloads, add existing size
            let totalBytes;
            if (serverSupportsResume && contentLengthHeader !== undefined) {
                // Server returned remaining bytes in content-length
                totalBytes =
                    existingSize + Number.parseInt(contentLengthHeader, 10);
            }
            else if (contentLengthHeader !== undefined) {
                totalBytes = Number.parseInt(contentLengthHeader, 10);
            }
            else {
                totalBytes = opts.expectedSize ?? 0;
            }
            // Progress tracking - start from existing size if resuming
            let bytesDownloaded = serverSupportsResume ? existingSize : 0;
            let lastProgressTime = Date.now();
            let lastProgressBytes = bytesDownloaded;
            let bytesPerSecond = 0;
            // Throttle progress updates
            let lastEmitTime = 0;
            /**
             * Resets the socket timeout when data is received.
             */
            const resetSocketTimeout = () => {
                if (socketTimeoutId) {
                    clearTimeout(socketTimeoutId);
                }
                socketTimeoutId = setTimeout(() => {
                    const error = new Error(`Socket timeout: no data received for ${socketTimeout}ms`);
                    error.code = "SOCKET_TIMEOUT";
                    abortWithError(error);
                    req.destroy();
                }, socketTimeout);
            };
            /**
             * Emits a progress update to the callback if provided.
             *
             * @param {boolean} force - Whether to force emit regardless of throttle.
             */
            const emitProgress = (force = false) => {
                if (!opts.onProgress)
                    return;
                const now = Date.now();
                if (!force && now - lastEmitTime < progressInterval)
                    return;
                lastEmitTime = now;
                // Calculate speed (bytes per second)
                const timeDelta = now - lastProgressTime;
                if (timeDelta > 0) {
                    const bytesDelta = bytesDownloaded - lastProgressBytes;
                    bytesPerSecond = Math.round((bytesDelta / timeDelta) * 1000);
                    lastProgressTime = now;
                    lastProgressBytes = bytesDownloaded;
                }
                // Calculate ETA
                const remainingBytes = totalBytes - bytesDownloaded;
                const etaSeconds = bytesPerSecond > 0
                    ? Math.round(remainingBytes / bytesPerSecond)
                    : 0;
                // Calculate percentage
                const percentComplete = totalBytes > 0
                    ? Math.min(100, (bytesDownloaded / totalBytes) * 100)
                    : 0;
                opts.onProgress({
                    bytesDownloaded,
                    totalBytes,
                    bytesPerSecond,
                    etaSeconds,
                    percentComplete,
                    isResuming: serverSupportsResume && isResuming,
                    resumedFromBytes: serverSupportsResume
                        ? existingSize
                        : undefined,
                    retryAttempt,
                });
            };
            // Start socket timeout
            resetSocketTimeout();
            // Emit initial progress if resuming
            if (serverSupportsResume && isResuming) {
                emitProgress(true);
            }
            // Track bytes written to detect file corruption
            let bytesWrittenThisSession = 0;
            const expectedBytesThisSession = serverSupportsResume
                ? totalBytes - existingSize
                : totalBytes;
            // Write the data to the file
            response.on("data", (chunk) => {
                // Reset socket timeout on each data chunk
                resetSocketTimeout();
                // Sanity check: prevent writing beyond expected size
                // Allow 1% tolerance for content-length inaccuracies
                const overflowThreshold = Math.max(expectedBytesThisSession * 1.01, expectedBytesThisSession + 1024);
                if (totalBytes > 0 &&
                    bytesWrittenThisSession + chunk.length >
                        overflowThreshold) {
                    // Delete the corrupt file so retry starts fresh
                    file.close(() => {
                        safeDeleteFile(resolvedDestination);
                    });
                    const error = new Error(`Data overflow detected: received ${bytesWrittenThisSession + chunk.length} bytes but expected ~${expectedBytesThisSession}`);
                    error.code = "DATA_OVERFLOW";
                    abortWithError(error);
                    req.destroy();
                    return;
                }
                file.write(chunk);
                bytesWrittenThisSession += chunk.length;
                bytesDownloaded += chunk.length;
                emitProgress();
            });
            // End the file
            response.on("end", () => {
                cleanup();
                // Ensure all data is flushed to disk before verifying
                file.end(() => {
                    // Emit final progress
                    emitProgress(true);
                    // Verify final file size matches expected
                    if (totalBytes > 0) {
                        const finalSize = getExistingFileSize(resolvedDestination);
                        if (finalSize !== totalBytes) {
                            // Delete corrupt file so retry starts fresh
                            safeDeleteFile(resolvedDestination);
                            const error = new Error(`File size mismatch: expected ${totalBytes} bytes but got ${finalSize}`);
                            error.code = "SIZE_MISMATCH";
                            reject(error);
                            return;
                        }
                    }
                    resolve(response);
                });
            });
            // Handle response errors
            response.on("error", (error) => {
                abortWithError(error);
            });
            // Handle premature close (connection dropped)
            response.on("close", () => {
                if (!aborted &&
                    bytesDownloaded < totalBytes &&
                    totalBytes > 0) {
                    const error = new Error(`Connection closed prematurely: downloaded ${bytesDownloaded} of ${totalBytes} bytes`);
                    error.code = "ECONNRESET";
                    abortWithError(error);
                }
            });
        });
        // Handle request errors
        req.on("error", (error) => {
            abortWithError(error);
        });
        // Handle request timeout (built-in)
        req.on("timeout", () => {
            const error = new Error(`Request timeout after ${connectTimeout}ms`);
            error.code = "ETIMEDOUT";
            req.destroy();
            abortWithError(error);
        });
    });
}
/**
 * Downloads a remote file to disk with automatic retry on transient errors.
 *
 * This function implements robust download handling with:
 * - Automatic resume support for partial downloads
 * - Exponential backoff with jitter for retries
 * - Configurable socket and connection timeouts
 * - Progress callbacks with retry information
 *
 * Common transient errors (ECONNRESET, timeout, etc.) will trigger automatic
 * retries with the partial file preserved for resume. This is critical for
 * reliable downloads in containerized environments where network instability
 * is more common.
 *
 * @param {StreamDownOptions | string} optionsOrUrl - Options object or URL string.
 * @param {string} destinationPath - Optional destination path (legacy).
 * @param {number} expectedSize - Optional expected size (legacy).
 * @param {(progress: DownloadProgress) => void} onProgress - Optional progress callback (legacy).
 * @returns {Promise<IncomingMessage>} Resolves with the response once the file is fully written.
 * @throws {DownloadError} If all retry attempts are exhausted without success.
 */
async function streamDown(optionsOrUrl, destinationPath, expectedSize, onProgress) {
    // Normalize arguments to options object
    const opts = typeof optionsOrUrl === "string"
        ? {
            url: optionsOrUrl,
            destinationPath,
            expectedSize,
            onProgress,
        }
        : optionsOrUrl;
    // Parse the URL using the modern WHATWG URL API
    const uri = new node_url_1.URL(opts.url);
    // Resolve the destination path to a file name
    const resolvedDestination = opts.destinationPath ?? path.basename(uri.pathname ?? opts.url);
    // Retry configuration with defaults
    const maxRetries = opts.retry?.maxRetries ?? 5;
    const initialBackoff = opts.retry?.initialBackoff ?? 5000;
    const maxBackoff = opts.retry?.maxBackoff ?? 60000;
    const backoffMultiplier = opts.retry?.backoffMultiplier ?? 2;
    // Check for existing partial file (resume support)
    const enableResume = opts.enableResume !== false;
    let lastError;
    let restartCount = 0;
    const maxRestarts = 3; // Limit how many times we'll restart from scratch due to corrupt files
    // Retry loop
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Validate existing partial file before attempting resume
        let existingSize = 0;
        if (enableResume) {
            const existingSizeBeforeValidation = getExistingFileSize(resolvedDestination);
            const validation = validatePartialFile(resolvedDestination, opts.expectedSize ?? 0);
            existingSize = validation.resumeFromBytes;
            // Notify if we had to delete a corrupt file
            if (validation.wasDeleted) {
                if (opts.onCorruptFileDeleted) {
                    opts.onCorruptFileDeleted(existingSizeBeforeValidation, opts.expectedSize ?? 0);
                }
                if (opts.retry?.onRetry) {
                    opts.retry.onRetry(attempt, new Error(`Deleted corrupt partial file (${existingSizeBeforeValidation} bytes, expected ${opts.expectedSize ?? "unknown"}), restarting download`), 0);
                }
            }
        }
        try {
            // Attempt the download
            const response = await attemptDownload(opts, existingSize, attempt);
            return response;
        }
        catch (error) {
            lastError = error;
            const errorWithCode = error;
            // Check if this is a 416 error that requires restart (file was already deleted)
            if (errorWithCode.requiresRestart) {
                restartCount++;
                if (restartCount > maxRestarts) {
                    throw new DownloadError(`Download failed: file corruption detected ${restartCount} times`, "CORRUPT_FILE_LOOP", attempt + 1, false, 0);
                }
                // Don't count this as a retry attempt - just loop again with fresh start
                // Decrement attempt so we don't lose a retry
                attempt--;
                // Notify about the restart
                if (opts.retry?.onRetry) {
                    opts.retry.onRetry(attempt + 1, new Error(`Restarting download from scratch (attempt ${restartCount}/${maxRestarts})`), 1000);
                }
                await sleep(1000);
                continue;
            }
            // Check if error is retryable
            const retryable = isRetryableError(errorWithCode);
            // If not retryable or we've exhausted retries, throw
            if (!retryable || attempt >= maxRetries) {
                const downloadedBytes = getExistingFileSize(resolvedDestination);
                throw new DownloadError(`Download failed after ${attempt + 1} attempt(s): ${error.message}`, errorWithCode.code, attempt + 1, retryable, downloadedBytes);
            }
            // Calculate backoff delay
            const delayMs = calculateBackoff(attempt, initialBackoff, maxBackoff, backoffMultiplier);
            // Notify about retry via callback
            if (opts.retry?.onRetry) {
                opts.retry.onRetry(attempt + 1, error, delayMs);
            }
            // Wait before retry
            await sleep(delayMs);
        }
    }
    // This should never be reached, but TypeScript needs it
    throw new DownloadError(`Download failed after ${maxRetries + 1} attempts`, lastError?.message, maxRetries + 1, false, getExistingFileSize(resolvedDestination));
}
//# sourceMappingURL=stream-down.js.map