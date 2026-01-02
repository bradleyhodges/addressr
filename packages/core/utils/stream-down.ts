import * as fs from "node:fs";
import type { IncomingMessage } from "node:http";
import { get } from "node:https";
import * as path from "node:path";
import { URL } from "node:url";

/**
 * Progress information provided during download.
 */
export interface DownloadProgress {
    /** Bytes downloaded so far */
    bytesDownloaded: number;
    /** Total bytes to download (may be 0 if unknown) */
    totalBytes: number;
    /** Download speed in bytes per second */
    bytesPerSecond: number;
    /** Estimated time remaining in seconds */
    etaSeconds: number;
    /** Percentage complete (0-100) */
    percentComplete: number;
    /** Whether the download is being resumed from a partial file */
    isResuming?: boolean;
    /** Size of the existing partial file (if resuming) */
    resumedFromBytes?: number;
}

/**
 * Result information returned after download completes.
 */
export interface DownloadResult {
    /** The HTTP response from the server */
    response: IncomingMessage;
    /** Whether the download was resumed from a partial file */
    resumed: boolean;
    /** Bytes downloaded in this session (excludes resumed bytes) */
    bytesDownloadedThisSession: number;
    /** Total bytes of the complete file */
    totalBytes: number;
}

/**
 * Options for the streamDown function.
 */
export interface StreamDownOptions {
    /** Remote URL to download */
    url: string;
    /** Optional destination path; defaults to the URL basename */
    destinationPath?: string;
    /** Optional expected size used when the response omits content-length */
    expectedSize?: number;
    /** Optional callback invoked on each progress update */
    onProgress?: (progress: DownloadProgress) => void;
    /** Progress update interval in milliseconds (default: 100ms) */
    progressInterval?: number;
    /** Enable resume for incomplete downloads (default: true) */
    enableResume?: boolean;
    /** Called when an incomplete file is detected */
    onIncompleteDetected?: (
        existingBytes: number,
        expectedBytes: number,
    ) => void;
}

/**
 * Gets the size of an existing file, returning 0 if the file doesn't exist.
 *
 * @param {string} filePath - Path to the file.
 * @returns {number} Size of the file in bytes, or 0 if not found.
 */
function getExistingFileSize(filePath: string): number {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch {
        return 0;
    }
}

/**
 * Downloads a remote file to disk with optional progress callbacks.
 *
 * @param {StreamDownOptions} options - Download options including URL and callbacks.
 * @returns {Promise<IncomingMessage>} Resolves with the response once the file is fully written.
 */
export default function streamDown(
    options: StreamDownOptions,
): Promise<IncomingMessage>;

/**
 * Downloads a remote file to disk (legacy signature).
 *
 * @param {string} url - Remote URL to download.
 * @param {string | undefined} destinationPath - Optional destination path; defaults to the URL basename.
 * @param {number | undefined} expectedSize - Optional expected size used when the response omits content-length.
 * @param {(progress: DownloadProgress) => void} onProgress - Optional progress callback.
 * @returns {Promise<IncomingMessage>} Resolves with the response once the file is fully written.
 */
export default function streamDown(
    url: string,
    destinationPath?: string,
    expectedSize?: number,
    onProgress?: (progress: DownloadProgress) => void,
): Promise<IncomingMessage>;

/**
 * Downloads a remote file to disk with optional progress callbacks.
 *
 * Supports both object-based options and legacy positional arguments.
 * Automatically resumes incomplete downloads when enableResume is true (default).
 *
 * @param {StreamDownOptions | string} optionsOrUrl - Options object or URL string.
 * @param {string} destinationPath - Optional destination path (legacy).
 * @param {number} expectedSize - Optional expected size (legacy).
 * @param {(progress: DownloadProgress) => void} onProgress - Optional progress callback (legacy).
 * @returns {Promise<IncomingMessage>} Resolves with the response once the file is fully written.
 */
export default function streamDown(
    optionsOrUrl: StreamDownOptions | string,
    destinationPath?: string,
    expectedSize?: number,
    onProgress?: (progress: DownloadProgress) => void,
): Promise<IncomingMessage> {
    // Normalize arguments to options object
    const opts: StreamDownOptions =
        typeof optionsOrUrl === "string"
            ? {
                  url: optionsOrUrl,
                  destinationPath,
                  expectedSize,
                  onProgress,
              }
            : optionsOrUrl;

    // Parse the URL using the modern WHATWG URL API
    const uri = new URL(opts.url);

    // Resolve the destination path to a file name
    const resolvedDestination =
        opts.destinationPath ?? path.basename(uri.pathname ?? opts.url);

    // Check for existing partial file (resume support)
    const enableResume = opts.enableResume !== false;
    const existingSize = enableResume
        ? getExistingFileSize(resolvedDestination)
        : 0;
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
        // Build request options with Range header for resume
        const requestOptions: {
            headers?: Record<string, string>;
        } = {};

        if (isResuming) {
            requestOptions.headers = {
                Range: `bytes=${existingSize}-`,
            };
        }

        // Get the response from the URL
        get(uri.href, requestOptions, (response: IncomingMessage) => {
            // Handle redirects (3xx status codes)
            if (
                response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
            ) {
                // Follow the redirect
                file.close();
                // Only delete if not resuming, otherwise we lose progress
                if (!isResuming) {
                    try {
                        fs.unlinkSync(resolvedDestination);
                    } catch {
                        // File may not exist yet
                    }
                }
                streamDown({
                    ...opts,
                    url: response.headers.location,
                })
                    .then(resolve)
                    .catch(reject);
                return;
            }

            // Check if server supports resume (206 Partial Content)
            const serverSupportsResume = response.statusCode === 206;

            // If we tried to resume but server doesn't support it, restart from beginning
            if (
                isResuming &&
                !serverSupportsResume &&
                response.statusCode === 200
            ) {
                file.close();
                // Delete the partial file and start fresh
                try {
                    fs.unlinkSync(resolvedDestination);
                } catch {
                    // Ignore deletion errors
                }
                // Retry without resume
                streamDown({
                    ...opts,
                    enableResume: false,
                })
                    .then(resolve)
                    .catch(reject);
                return;
            }

            // Get the content length header
            const contentLengthHeader = response.headers["content-length"];

            // Calculate total bytes - for resumed downloads, add existing size
            let totalBytes: number;
            if (serverSupportsResume && contentLengthHeader !== undefined) {
                // Server returned remaining bytes in content-length
                totalBytes =
                    existingSize + Number.parseInt(contentLengthHeader, 10);
            } else if (contentLengthHeader !== undefined) {
                totalBytes = Number.parseInt(contentLengthHeader, 10);
            } else {
                totalBytes = opts.expectedSize ?? 0;
            }

            // Progress tracking - start from existing size if resuming
            let bytesDownloaded = serverSupportsResume ? existingSize : 0;
            const bytesDownloadedStart = bytesDownloaded;
            let lastProgressTime = Date.now();
            let lastProgressBytes = bytesDownloaded;
            let bytesPerSecond = 0;

            // Throttle progress updates
            let lastEmitTime = 0;

            /**
             * Emits a progress update to the callback if provided.
             *
             * @param {boolean} force - Whether to force emit regardless of throttle.
             */
            const emitProgress = (force = false): void => {
                if (!opts.onProgress) return;

                const now = Date.now();
                if (!force && now - lastEmitTime < progressInterval) return;
                lastEmitTime = now;

                // Calculate speed (bytes per second)
                const timeDelta = now - lastProgressTime;
                if (timeDelta > 0) {
                    const bytesDelta = bytesDownloaded - lastProgressBytes;
                    bytesPerSecond = Math.round(
                        (bytesDelta / timeDelta) * 1000,
                    );
                    lastProgressTime = now;
                    lastProgressBytes = bytesDownloaded;
                }

                // Calculate ETA
                const remainingBytes = totalBytes - bytesDownloaded;
                const etaSeconds =
                    bytesPerSecond > 0
                        ? Math.round(remainingBytes / bytesPerSecond)
                        : 0;

                // Calculate percentage
                const percentComplete =
                    totalBytes > 0
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
                });
            };

            // Emit initial progress if resuming
            if (serverSupportsResume && isResuming) {
                emitProgress(true);
            }

            // Write the data to the file
            response.on("data", (chunk: Buffer) => {
                file.write(chunk);
                bytesDownloaded += chunk.length;
                emitProgress();
            });

            // End the file
            response.on("end", () => {
                file.end();
                // Emit final progress
                emitProgress(true);
                resolve(response);
            });

            // Handle errors
            response.on("error", (error: Error) => {
                file.close();
                reject(error);
            });
        }).on("error", (error: Error) => {
            file.close();
            reject(error);
        });
    });
}
