import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as stream from "node:stream";
import { initIndex } from "@repo/addresskit-client/elasticsearch";
import download from "@repo/addresskit-core/utils/stream-down";
import * as directoryExists from "directory-exists";
import * as glob from "glob-promise";
import * as got from "got";
import * as Papa from "papaparse";
import * as unzip from "unzip-stream";
import {
    COVERED_STATES,
    ENABLE_GEO,
    ES_CLEAR_INDEX,
    ES_INDEX_NAME,
    GNAF_DIR,
    GNAF_PACKAGE_URL,
    INDEX_BACKOFF_INCREMENT,
    INDEX_BACKOFF_INITIAL,
    INDEX_BACKOFF_MAX,
    INDEX_MAX_RETRIES,
    INDEX_TIMEOUT,
    LOADING_CHUNK_SIZE,
    ONE_DAY_MS,
    THIRTY_DAYS_MS,
} from "../conf";
import { DYNAMIC_RESOURCES_ENABLED, VERBOSE } from "../config";
import {
    ResourceMonitor,
    buildSynonyms,
    clearAuthorityCodeMaps,
    createProgressBar,
    failSpinner,
    formatBytes,
    formatDuration,
    formatNumber,
    formatState,
    getDaemonMode,
    getOptimalChunkSize,
    isMemoryPressure,
    logInfo,
    logWarning,
    mapAddressDetails,
    startSpinner,
    succeedSpinner,
    theme,
    updateSpinner,
    waitForMemory,
} from "../helpers";
import {
    countLinesInFile,
    fileExists,
    getFiles,
    loadFileCounts,
} from "../helpers/fs";
import { cache, error, fsp, gotClient, logger } from "../index";
import type * as Types from "../types/index";

/**
 * Fetches the GNAF package data from the cache (if fresh enough content exists) or from the network.
 *
 * @alias fetchPackageData
 *
 * @returns {Promise<got.Response<string>>} The GNAF package data.
 * @throws {Error} If the GNAF package data cannot be fetched.
 */
const fetchGNAFPackageData = async (): Promise<got.Response<string>> => {
    // Get the GNAF package URL
    const packageUrl = GNAF_PACKAGE_URL;

    // See if we have the value in cache
    const cachedResponse = await cache.get(packageUrl);
    if (VERBOSE) logger("cached gnaf package data", cachedResponse);

    // Get the age of the cached response
    let age = 0;
    if (cachedResponse !== undefined) {
        // Set the cache header to HIT
        cachedResponse.headers["x-cache"] = "HIT";

        // Get the created date from the cache headers
        const created =
            cachedResponse.cachedAt !== undefined
                ? new Date(cachedResponse.cachedAt)
                : new Date(cachedResponse.headers.date);
        if (VERBOSE) logger("created", created);

        // Calculate the age of the cached response
        age = Date.now() - created.getTime();

        // If the age is less than or equal to one day, return the cached response
        if (age <= ONE_DAY_MS) {
            return cachedResponse as unknown as got.Response<string>;
        }
    }

    // cached value was older than one day, so go fetch
    try {
        // Fetch the GNAF package data
        const response = await gotClient.get(packageUrl);
        if (VERBOSE) logger("response.isFromCache", response.fromCache);
        if (VERBOSE)
            logger("fresh gnaf package data", {
                body: response.body,
                headers: response.headers,
            });

        // Set the cache response
        await cache.set(packageUrl, {
            body: response.body,
            headers: response.headers,
            cachedAt: Date.now(),
        });

        // Set the cache header to MISS
        response.headers["x-cache"] = response.fromCache ? "HIT" : "MISS";

        // Return the response
        return response as got.Response<string>;
    } catch (error_) {
        // We were unable to fetch. If we have cached value that isn't stale, return in
        if (cachedResponse !== undefined) {
            // If the age is less than 30 days, return the cached response
            if (age < THIRTY_DAYS_MS) {
                // Set the cache header to STALE
                cachedResponse.headers.warning =
                    '110	custom/1.0 "Response is Stale"';
                return cachedResponse;
            }
        }

        // Otherwise, throw the original network error
        throw error_;
    }
};

/**
 * Fetches the GNAF file from the cache (if fresh enough content exists), or if it is not fresh or doesn't
 * exist, downloads it from the internet.
 *
 * @alias fetchGnafFile
 *
 * @returns {Promise<string>} The path to the GNAF file.
 * @throws {Error} If the GNAF file cannot be fetched.
 */
const fetchGNAFArchive = async (): Promise<string> => {
    // Fetch the GNAF package data
    const response = await fetchGNAFPackageData();

    // Parse the GNAF package data
    const pack = JSON.parse(response.body);

    // Find the data resource for the GNAF file
    const dataResource = pack.result.resources.find(
        (r: { state: string; mimetype: string }) =>
            r.state === "active" && r.mimetype === "application/zip",
    );

    // Log the data resource (id as of 16/07/2019 for zip is 4b084096-65e4-4c8e-abbe-5e54ff85f42f)
    if (VERBOSE)
        logger("dataResource", JSON.stringify(dataResource, undefined, 2));
    if (VERBOSE) logger("url", dataResource.url);
    if (VERBOSE)
        logger("headers", JSON.stringify(response.headers, undefined, 2));

    // Get the basename of the GNAF file
    const basename = path.basename(dataResource.url);
    if (VERBOSE) logger("basename", basename);

    // Get the complete and incomplete paths for the GNAF file
    const complete_path = GNAF_DIR;
    const incomplete_path = `${complete_path}/incomplete`;

    // Create the incomplete path
    await new Promise((resolve, reject) => {
        fs.mkdir(incomplete_path, { recursive: true }, (error_) => {
            // If there is an error, reject the promise
            if (error_) reject(error_);
            // Otherwise, if there is no error, resolve the promise
            else resolve(void 0);
        });
    });

    // Get the destination path for the GNAF file
    const destination = `${complete_path}/${basename}`;

    // Create the complete path
    await new Promise((resolve, reject) => {
        fs.mkdir(incomplete_path, { recursive: true }, (error_) => {
            // If there is an error, reject the promise
            if (error_) reject(error_);
            // Otherwise, if there is no error, resolve the promise
            else resolve(void 0);
        });
    });

    // Try to access the destination file
    try {
        await new Promise((resolve, reject) => {
            fs.access(destination, fs.constants.R_OK, (error_) => {
                // If there is an error, reject the promise
                if (error_) reject(error_);
                // Otherwise, if there is no error, resolve the promise
                else resolve(void 0);
            });
        });

        // Verify the file size matches expected size
        const existingStats = fs.statSync(destination);
        if (dataResource.size && existingStats.size !== dataResource.size) {
            // File exists but is incomplete or corrupted
            if (VERBOSE)
                logger(
                    `Existing file size (${existingStats.size}) doesn't match expected (${dataResource.size}), re-downloading`,
                );
            // Delete the corrupted file and continue to download
            fs.unlinkSync(destination);
            throw new Error("File size mismatch");
        }

        // The destination file exists and has correct size, skip download
        return destination;
    } catch {
        // The destination file does not exist or is invalid, so we need to download it.
        if (VERBOSE) logger("Starting G-NAF download");

        // Check for incomplete download from previous attempt
        const incompleteFile = `${incomplete_path}/${basename}`;
        let existingBytes = 0;
        try {
            const incompleteStats = fs.statSync(incompleteFile);
            existingBytes = incompleteStats.size;
        } catch {
            // No incomplete file exists
        }

        // Track whether we're resuming
        let isResuming = false;

        // Start a spinner for the download
        const downloadSpinner =
            existingBytes > 0
                ? startSpinner(
                      `Resuming G-NAF download from ${formatBytes(existingBytes)}...`,
                  )
                : startSpinner("Downloading G-NAF data file...");
        const downloadStartTime = Date.now();

        try {
            // Download the GNAF file with progress callback and resume support
            await download({
                url: dataResource.url,
                destinationPath: incompleteFile,
                expectedSize: dataResource.size,
                enableResume: true,
                onIncompleteDetected: (existing, expected) => {
                    isResuming = true;
                    if (VERBOSE)
                        logger(
                            `Found incomplete download: ${formatBytes(existing)} of ${formatBytes(expected)} (${((existing / expected) * 100).toFixed(1)}%)`,
                        );
                },
                onProgress: (progress) => {
                    // Build progress display with the terminalUI progress bar
                    const progressBar = createProgressBar(
                        progress.bytesDownloaded,
                        progress.totalBytes,
                        25,
                    );

                    // Format speed and ETA
                    const speed = formatBytes(progress.bytesPerSecond);
                    const downloaded = formatBytes(progress.bytesDownloaded);
                    const total = formatBytes(progress.totalBytes);
                    const eta =
                        progress.etaSeconds > 0
                            ? formatDuration(progress.etaSeconds * 1000)
                            : "calculating...";

                    // Show resume indicator if applicable
                    const resumeIndicator = progress.isResuming
                        ? theme.secondary(" (resumed)")
                        : "";

                    // Update spinner text with beautiful progress info
                    updateSpinner(
                        `Downloading G-NAF${resumeIndicator}  ${progressBar}  ${theme.muted(`${downloaded} / ${total}`)}  ${theme.secondary(`${speed}/s`)}  ${theme.dim(`ETA: ${eta}`)}`,
                    );
                },
            });

            // Verify downloaded file size
            const downloadedStats = fs.statSync(incompleteFile);
            if (
                dataResource.size &&
                downloadedStats.size !== dataResource.size
            ) {
                // Downloaded file is incomplete or corrupted
                throw new Error(
                    `Downloaded file size (${downloadedStats.size}) doesn't match expected (${dataResource.size})`,
                );
            }

            // Calculate download duration
            const downloadDuration = Date.now() - downloadStartTime;
            const resumeText = isResuming ? " (resumed)" : "";
            succeedSpinner(
                `Downloaded G-NAF data file${resumeText} (${formatBytes(dataResource.size)} in ${formatDuration(downloadDuration)})`,
            );

            // Rename the GNAF file
            await fsp.rename(incompleteFile, destination);
            if (VERBOSE) logger("Finished downloading G-NAF", destination);

            // Return the destination path
            return destination;
        } catch (error_) {
            // Fail the spinner
            failSpinner("Failed to download G-NAF data file");

            // Log the error with helpful context
            if (existingBytes > 0) {
                error(
                    `Error downloading G-NAF (partial file preserved at ${incompleteFile} for resume)`,
                    error_,
                );
            } else {
                error("Error downloading G-NAF", error_);
            }

            // Throw the error
            throw error_;
        }
    }
};

/**
 * Unzips the GNAF archive file.
 *
 * @alias unzipFile
 *
 * @param file - The path to the GNAF archive file.
 *
 * @returns {Promise<string>} The path to the unzipped GNAF file.
 * @throws {Error} If the GNAF archive file cannot be unzipped.
 */
const unzipGNAFArchive = async (file: string): Promise<string> => {
    // Get the extension and basename of the GNAF archive file
    const extname = path.extname(file);
    const basenameWithoutExtention = path.basename(file, extname);

    // Get the incomplete and complete paths for the GNAF file
    const incomplete_path = `${GNAF_DIR}/incomplete/${basenameWithoutExtention}`;
    const complete_path = `${GNAF_DIR}/${basenameWithoutExtention}`;

    // See if the complete path exists
    const exists = await directoryExists(complete_path);

    // If the complete path exists, skip the extraction
    if (exists) {
        if (VERBOSE) logger("directory exits. Skipping extract", complete_path);
        return complete_path;
    }

    // Create the incomplete path
    await new Promise((resolve, reject) => {
        fs.mkdir(incomplete_path, { recursive: true }, (error_) => {
            // If there is an error, reject the promise
            if (error_) reject(error_);
            // Otherwise, if there is no error, resolve the promise
            else resolve(void 0);
        });
    });

    // Create a read stream from the GNAF archive file
    const readStream = fs.createReadStream(file);
    if (VERBOSE) logger("before pipe");

    // Create a promise to extract the GNAF archive file
    const prom = new Promise<void>((resolve, reject) => {
        readStream
            // Parse the GNAF archive file
            .pipe(unzip.Parse())
            // Transform the GNAF archive file
            .pipe(
                new stream.Transform({
                    objectMode: true,
                    transform: (entry, encoding, callback) => {
                        // Get the path to the entry
                        const entryPath = `${incomplete_path}/${entry.path}`;

                        // If the entry is a directory, create the directory
                        if (entry.isDirectory) {
                            // Create the directory
                            fs.mkdir(
                                entryPath,
                                { recursive: true },
                                (error_) => {
                                    // If there is an error, reject the promise
                                    if (error_) {
                                        // Drain the entry
                                        entry.autodrain();
                                        callback(error_);
                                    } else {
                                        // Drain the entry
                                        entry.autodrain();

                                        // Otherwise, if there is no error, resolve the promise
                                        callback();
                                    }
                                },
                            );
                        } else {
                            // Get the directory name of the entry
                            const dirname = path.dirname(entryPath);
                            // Create the directory
                            fs.mkdir(dirname, { recursive: true }, (error_) => {
                                // If there is an error, reject the promise
                                if (error_) {
                                    // Drain the entry
                                    entry.autodrain();
                                    callback(error_);
                                } else {
                                    // Stat the entry
                                    fs.stat(entryPath, (error_, stats) => {
                                        // If there is an error, reject the promise
                                        if (
                                            error_ &&
                                            error_.code !== "ENOENT"
                                        ) {
                                            // Log the error
                                            if (VERBOSE)
                                                logger(
                                                    "error statting file",
                                                    error_,
                                                );

                                            // Drain the entry
                                            entry.autodrain();

                                            // Call the callback with the error
                                            callback(error_);
                                            return;
                                        }

                                        // If the size of the entry is the same as the size of the file, skip the extraction
                                        if (
                                            stats !== undefined &&
                                            stats.size === entry.size
                                        ) {
                                            // No need to extract again. Skip
                                            if (VERBOSE)
                                                logger(
                                                    "skipping extract for",
                                                    entryPath,
                                                );
                                            entry.autodrain();
                                            callback();
                                        } else {
                                            // The size of the entry is different from the size of the file, so we need to extract
                                            // the file. Pipe the entry to the write stream
                                            if (VERBOSE)
                                                logger("extracting", entryPath);
                                            entry
                                                .pipe(
                                                    fs.createWriteStream(
                                                        entryPath,
                                                    ),
                                                )
                                                // On finish, log the message and call the callback
                                                .on("finish", () => {
                                                    if (VERBOSE)
                                                        logger(
                                                            "finished extracting",
                                                            entryPath,
                                                        );
                                                    callback();
                                                })
                                                // On error, log the message and call the callback
                                                .on("error", (error: Error) => {
                                                    if (VERBOSE)
                                                        logger(
                                                            "error unzipping entry",
                                                            error,
                                                        );
                                                    callback(error);
                                                });
                                        }
                                    });
                                }
                            });
                        }
                    },
                }),
            )
            // On finish, log the message and call the callback
            .on("finish", () => {
                if (VERBOSE) logger("finish");
                resolve();
            })
            // On error, log the message and call the callback
            .on("error", (error_) => {
                if (VERBOSE) logger("error unzipping data file", error_);
                reject(error_);
            });
    });

    // Wait for the promise to resolve
    await prom;

    // Rename the incomplete path to the complete path
    return await new Promise((resolve, reject) => {
        fs.rename(incomplete_path, complete_path, (error_) => {
            if (error_) reject(error_);
            else resolve(complete_path);
        });
    });
};

/**
 * Computes an MD5 hash of the document for ETag support.
 *
 * Pre-computing hashes during indexing avoids the CPU cost of hash
 * computation on every getAddress request, improving response times.
 *
 * @param doc - The document object to hash.
 * @returns The MD5 hash as a hex string.
 */
const computeDocumentHash = (doc: Record<string, unknown>): string => {
    return crypto.createHash("md5").update(JSON.stringify(doc)).digest("hex");
};

/**
 * Progress information for address indexing.
 */
interface IndexingProgress {
    /** Number of addresses processed so far */
    processed: number;
    /** Total addresses to process */
    total: number;
    /** Processing speed in addresses per second */
    addressesPerSecond: number;
    /** Estimated time remaining in seconds */
    etaSeconds: number;
    /** Percentage complete (0-100) */
    percentComplete: number;
}

/**
 * Options for loading GNAF addresses.
 */
interface LoadGNAFAddressOptions {
    /** Whether to refresh the index after each chunk */
    refresh?: boolean;
    /** Callback for progress updates */
    onProgress?: (progress: IndexingProgress) => void;
    /** Progress update interval in milliseconds (default: 250ms) */
    progressInterval?: number;
}

/**
 * Loads the GNAF address details into the index.
 *
 * This function implements several performance optimizations:
 * - Dynamic chunk sizing based on available system memory
 * - Memory pressure monitoring with adaptive throttling
 * - Pre-computed document hashes for ETag support
 * - Resilient error handling with chunk-level recovery
 *
 * @alias loadAddressDetails
 *
 * @param file - The path to the GNAF file.
 * @param expectedCount - The expected number of rows in the GNAF file.
 * @param context - The context containing the authority code tables.
 * @param options - Loading options including refresh and progress callback.
 *
 * @returns {Promise<void>} - A promise that resolves when the GNAF address details are loaded into the index.
 */
const loadGNAFAddress = async (
    file: string,
    expectedCount: number,
    context: Types.MapPropertyContext,
    options: LoadGNAFAddressOptions = {},
): Promise<void> => {
    const { refresh = false, onProgress, progressInterval = 250 } = options;

    // Initialize the actual count
    let actualCount = 0;

    // Progress tracking state
    const startTime = Date.now();
    let lastProgressTime = 0;

    /**
     * Emits a progress update to the callback if provided.
     *
     * @param {boolean} force - Whether to force emit regardless of throttle.
     */
    const emitProgress = (force = false): void => {
        if (!onProgress) return;

        const now = Date.now();
        if (!force && now - lastProgressTime < progressInterval) return;
        lastProgressTime = now;

        // Calculate elapsed time and speed
        const elapsedMs = now - startTime;
        const addressesPerSecond =
            elapsedMs > 0 ? Math.round((actualCount / elapsedMs) * 1000) : 0;

        // Calculate ETA
        const remainingAddresses = expectedCount - actualCount;
        const etaSeconds =
            addressesPerSecond > 0
                ? Math.round(remainingAddresses / addressesPerSecond)
                : 0;

        // Calculate percentage
        const percentComplete =
            expectedCount > 0
                ? Math.min(100, (actualCount / expectedCount) * 100)
                : 0;

        onProgress({
            processed: actualCount,
            total: expectedCount,
            addressesPerSecond,
            etaSeconds,
            percentComplete,
        });
    };

    // Determine chunk size: use dynamic sizing if enabled, otherwise use configured value
    const chunkSizeMB = DYNAMIC_RESOURCES_ENABLED
        ? getOptimalChunkSize()
        : LOADING_CHUNK_SIZE;

    if (VERBOSE)
        logger(
            `Loading addresses with chunk size: ${chunkSizeMB}MB (dynamic: ${DYNAMIC_RESOURCES_ENABLED})`,
        );

    // Create a promise to load the GNAF address details into the index
    await new Promise<void>((resolve, reject) => {
        // Parse the GNAF file with configurable chunk size for memory efficiency
        Papa.parse(fs.createReadStream(file), {
            header: true,
            skipEmptyLines: true,
            // Convert chunk size from MB to bytes
            chunkSize: chunkSizeMB * 1024 * 1024,
            chunk: (
                chunk: Papa.ParseResult<Types.AddressDetailRow>,
                parser: Papa.Parser,
            ) => {
                // Pause the parser to apply backpressure
                parser.pause();

                // If there are errors, log the errors
                if (chunk.errors.length > 0) {
                    error(`Errors reading '${file}': ${chunk.errors}`);
                    error({ errors: chunk.errors });
                }

                // Process chunk with memory pressure awareness
                processAddressChunk(
                    chunk.data,
                    context,
                    actualCount,
                    expectedCount,
                    refresh,
                )
                    .then((processedCount) => {
                        // Update the actual count with the number of processed rows
                        actualCount += processedCount;

                        // Emit progress update
                        emitProgress();

                        // Check for memory pressure before resuming
                        if (DYNAMIC_RESOURCES_ENABLED && isMemoryPressure()) {
                            logger(
                                "Memory pressure detected, waiting before next chunk...",
                            );
                            // Wait for memory to become available before resuming
                            waitForMemory(1000, 30000)
                                .then(() => {
                                    parser.resume();
                                })
                                .catch(() => {
                                    // Continue even if wait times out
                                    parser.resume();
                                });
                        } else {
                            parser.resume();
                        }
                    })
                    .catch((error_: Error) => {
                        error("error processing chunk", error_);
                        // Reject to stop processing on error
                        reject(error_);
                    });
            },
            // On complete, log the message and resolve
            complete: () => {
                // Emit final progress
                emitProgress(true);

                if (VERBOSE)
                    logger(
                        "Address details loaded",
                        context.state,
                        expectedCount || "",
                    );
                resolve();
            },
            error: (_error, file) => {
                error(_error, file);
                reject(new Error(`Failed to parse ${file}: ${_error.message}`));
            },
        });
    });

    // Validate the actual count against the expected count
    if (expectedCount !== undefined && actualCount !== expectedCount) {
        error(
            `Error loading '${file}'. Expected '${expectedCount}' rows, got '${actualCount}'`,
        );
    } else {
        if (VERBOSE) logger(`loaded '${actualCount}' rows from '${file}'`);
    }
};

/**
 * Processes a chunk of address detail rows and indexes them.
 *
 * This function handles the mapping of raw G-NAF rows to structured addresses,
 * computes document hashes for ETag support, and sends the bulk index request.
 *
 * @param rows - Array of raw address detail rows from the chunk.
 * @param context - The mapping context containing authority code tables.
 * @param startIndex - The starting row index for progress logging.
 * @param expectedCount - Total expected row count for progress calculation.
 * @param refresh - Whether to refresh the index after indexing.
 * @returns The number of rows successfully processed.
 */
const processAddressChunk = async (
    rows: Types.AddressDetailRow[],
    context: Types.MapPropertyContext,
    startIndex: number,
    expectedCount: number,
    refresh: boolean,
): Promise<number> => {
    // Skip empty chunks
    if (rows.length === 0) {
        return 0;
    }

    // Create a list to store the indexing body
    const indexingBody: Types.BulkIndexBody = [];
    let processedCount = 0;

    // Process each row in the chunk
    for (const row of rows) {
        // Map the row to a structured address
        const item = mapAddressDetails(
            row,
            context,
            startIndex + processedCount,
            expectedCount,
        );

        // Increment the processed count
        processedCount += 1;

        // Add the index operation header
        indexingBody.push({
            index: {
                _index: ES_INDEX_NAME,
                _id: `/addresses/${item.pid}`,
            },
        });

        // Destructure address components for the document body
        const { sla, ssla, ...structured } = item;

        // Create the document body with pre-computed hash for ETag support
        const docBody = {
            sla,
            ssla,
            structured,
            confidence: structured.structured.confidence,
        };

        // Compute and store the document hash for efficient ETag generation
        // This avoids recomputing the hash on every getAddress request
        const documentHash = computeDocumentHash(docBody);

        // Add the address document with hash to the indexing body
        indexingBody.push({
            ...docBody,
            documentHash,
        });
    }

    // Send the bulk index request
    if (indexingBody.length > 0) {
        await sendIndexRequest(indexingBody, undefined, { refresh });
    }

    return processedCount;
};

/**
 * Custom error class for indexing failures with context about retry attempts.
 *
 * This error includes detailed information about the failure to aid debugging
 * and provides context for monitoring and alerting systems.
 */
export class IndexingError extends Error {
    /** Number of retry attempts made before giving up */
    readonly attempts: number;
    /** The underlying error or response that caused the failure */
    readonly cause: unknown;
    /** Number of documents that failed to index */
    readonly documentCount: number;

    /**
     * Creates a new IndexingError.
     *
     * @param message - Human-readable error description.
     * @param attempts - Number of retry attempts made.
     * @param cause - The underlying error or failed response.
     * @param documentCount - Number of documents in the failed batch.
     */
    constructor(
        message: string,
        attempts: number,
        cause: unknown,
        documentCount = 0,
    ) {
        super(message);
        this.name = "IndexingError";
        this.attempts = attempts;
        this.cause = cause;
        this.documentCount = documentCount;
    }
}

/**
 * Extracts and logs detailed error information from a bulk indexing response.
 *
 * This function parses the OpenSearch bulk response to identify specific
 * document failures and their error messages, aiding in debugging.
 *
 * @param response - The bulk indexing response from OpenSearch.
 * @returns An array of error messages for failed documents.
 */
const extractBulkErrors = (
    response: Record<string, unknown>,
): { failedCount: number; errors: string[] } => {
    const errors: string[] = [];
    let failedCount = 0;

    // Extract items array from response body
    const items =
        (response.body as Record<string, unknown>)?.items ??
        (response as { items?: unknown[] }).items;

    if (Array.isArray(items)) {
        for (const item of items) {
            // Each item has an action key (index, create, update, delete)
            const action = item as Record<string, Record<string, unknown>>;
            const actionData = action.index ?? action.create ?? action.update;

            if (actionData?.error) {
                failedCount++;
                // Limit error messages to prevent excessive logging
                if (errors.length < 5) {
                    const errorInfo = actionData.error as Record<
                        string,
                        unknown
                    >;
                    errors.push(
                        `${actionData._id}: ${errorInfo.type} - ${errorInfo.reason}`,
                    );
                }
            }
        }
    }

    return { failedCount, errors };
};

/**
 * Determines if an error is retryable based on its type.
 *
 * Certain errors (like network timeouts or circuit breaker errors)
 * are worth retrying, while others (like mapping errors) are not.
 *
 * @param err - The error to evaluate.
 * @returns True if the error is potentially transient and worth retrying.
 */
const isRetryableError = (err: unknown): boolean => {
    // Check for common transient error types
    if (err instanceof Error) {
        const message = err.message.toLowerCase();
        // Network and timeout errors are retryable
        if (
            message.includes("timeout") ||
            message.includes("econnreset") ||
            message.includes("econnrefused") ||
            message.includes("socket hang up") ||
            message.includes("circuit")
        ) {
            return true;
        }
    }

    // OpenSearch bulk response with errors
    if (typeof err === "object" && err !== null) {
        const response = err as Record<string, unknown>;
        // Check if it's a bulk response with errors (potentially retryable)
        const body = response.body as Record<string, unknown> | undefined;
        if (response.errors === true || body?.errors === true) {
            return true;
        }
    }

    // Default to retryable for unknown errors (conservative approach)
    return true;
};

/**
 * Sends a bulk indexing request to OpenSearch with exponential backoff and bounded retries.
 *
 * This function implements a robust retry strategy for bulk indexing operations:
 * - Exponential backoff starting from INDEX_BACKOFF_INITIAL
 * - Linear increment added after each retry (INDEX_BACKOFF_INCREMENT)
 * - Maximum backoff capped at INDEX_BACKOFF_MAX
 * - Maximum retry count capped at INDEX_MAX_RETRIES (0 = unlimited, not recommended)
 * - Detailed error extraction for debugging failed documents
 * - Memory pressure awareness for adaptive throttling
 *
 * @alias sendIndexRequest
 *
 * @param indexingBody - Array of index operations and documents to bulk index.
 * @param initialBackoff - Initial backoff delay in ms (defaults to INDEX_BACKOFF_INITIAL).
 * @param options - Additional options for the indexing request.
 * @param options.refresh - Whether to refresh the index after indexing (default: false).
 *
 * @returns A promise that resolves when the index request succeeds.
 * @throws {IndexingError} If all retry attempts are exhausted without success.
 */
export const sendIndexRequest = async (
    indexingBody: Types.BulkIndexBody,
    initialBackoff: number = INDEX_BACKOFF_INITIAL,
    { refresh = false }: { refresh?: boolean } = {},
): Promise<void> => {
    // Calculate document count (each document has a header + body, so divide by 2)
    const documentCount = Math.floor(indexingBody.length / 2);

    // Skip empty requests
    if (documentCount === 0) {
        return;
    }

    // Initialize the backoff delay for the first retry
    let backoff = initialBackoff;

    // Track the last error for inclusion in the final IndexingError
    let lastError: unknown;

    // Retry loop with bounded iterations (INDEX_MAX_RETRIES of 0 means unlimited)
    const maxRetries =
        INDEX_MAX_RETRIES > 0 ? INDEX_MAX_RETRIES : Number.MAX_SAFE_INTEGER;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Check for memory pressure before attempting indexing
        if (DYNAMIC_RESOURCES_ENABLED && isMemoryPressure()) {
            if (VERBOSE)
                logger("Memory pressure detected before indexing, waiting...");
            await waitForMemory(1000, 10000);
        }

        try {
            // Send the bulk indexing request to OpenSearch
            const resp = (await (
                global.esClient as Types.OpensearchClient
            ).bulk({
                refresh,
                body: indexingBody,
                timeout: INDEX_TIMEOUT,
            })) as Types.OpensearchApiResponse<
                Record<string, unknown>,
                unknown
            > & {
                errors?: boolean | undefined;
            };

            // Check for partial failures in the bulk response
            // OpenSearch returns errors: true if any document failed to index
            if (resp?.errors || resp.body?.errors) {
                // Extract detailed error information for debugging
                const { failedCount, errors: bulkErrors } = extractBulkErrors(
                    resp as unknown as Record<string, unknown>,
                );

                if (bulkErrors.length > 0) {
                    error(
                        `Bulk indexing partial failure: ${failedCount}/${documentCount} documents failed`,
                    );
                    for (const err of bulkErrors) {
                        error(`  - ${err}`);
                    }
                }

                throw resp;
            }

            // Success - all documents indexed
            if (VERBOSE)
                logger(`Successfully indexed ${documentCount} documents`);
            return;
        } catch (error_) {
            // Store the error for potential inclusion in IndexingError
            lastError = error_;

            // Check if this error is worth retrying
            if (!isRetryableError(error_)) {
                error("Non-retryable error encountered, failing immediately");
                break;
            }

            // Log the error details for debugging
            error(
                `Indexing attempt ${attempt + 1}/${maxRetries} failed for ${documentCount} documents`,
            );

            // Check if we've exhausted all retries
            if (attempt >= maxRetries) {
                error(`Maximum retries (${maxRetries}) exhausted. Giving up.`);
                break;
            }

            // Log the backoff delay before waiting
            error(`Backing off for ${backoff}ms before retry`);

            // Wait for the backoff period before retrying
            await new Promise<void>((resolve) => {
                setTimeout(resolve, backoff);
            });

            // Calculate the next backoff delay with linear increment
            // This provides a hybrid exponential/linear backoff pattern
            backoff += INDEX_BACKOFF_INCREMENT;

            // Cap the backoff at the maximum configured value
            backoff = Math.min(INDEX_BACKOFF_MAX, backoff);
        }
    }

    // All retries exhausted - throw a descriptive error
    throw new IndexingError(
        `Failed to index ${documentCount} documents after ${maxRetries} attempts`,
        maxRetries,
        lastError,
        documentCount,
    );
};

/**
 * Gets the state name from the given file.
 *
 * @alias getStateName
 *
 * @param abbr - The abbreviation of the state.
 * @param file - The path to the file to parse the state name from.
 *
 * @returns {Promise<string>} - A promise that resolves with the state name.
 * @throws {Error} If the state name cannot be found or the file cannot be parsed.
 */
const getStateName = async (abbr: string, file: string): Promise<string> => {
    // Parse the file
    return await new Promise<string>((resolve, reject) => {
        Papa.parse(fs.createReadStream(file), {
            header: true,
            delimiter: "|",
            // On complete, resolve the promise with the state name
            complete: (results: Papa.ParseResult<{ STATE_NAME: string }>) => {
                // If the results are empty, reject the promise
                if (results.data.length === 0) {
                    reject(new Error(`No state name found in file '${file}'`));
                }

                // Resolve the promise with the state name
                resolve(results.data[0].STATE_NAME);
            },
            // On error, log the error and reject the promise
            error: (error, file) => {
                console.log(
                    "[getStateName] error getting state name",
                    error,
                    file,
                );
                reject(error);
            },
        });
    });
};

/**
 * Loads all G-NAF data from the specified directory into the OpenSearch index.
 *
 * This function orchestrates the entire GNAF loading process:
 * 1. Reads the file counts to verify data integrity
 * 2. Loads all authority code lookup tables
 * 3. Builds synonyms from authority codes for search enhancement
 * 4. Initializes the OpenSearch index with appropriate mappings
 * 5. For each state, loads streets, localities, geocodes, and address details
 *
 * @alias loadGnafData
 *
 * @param directory - The path to the extracted G-NAF data directory
 * @param options - Optional loading configuration
 * @param options.refresh - Whether to refresh the index after loading (default: false)
 *
 * @returns A promise that resolves when all data is loaded
 * @throws {Error} If required files cannot be found or parsed
 */
const initGNAFDataLoader = async (
    directory: string,
    { refresh = false }: { refresh?: boolean } = {},
): Promise<void> => {
    // Path to the counts file which contains expected row counts for validation
    const countsFile = `${directory}/Counts.csv`;
    const countsFileExists = await fileExists(countsFile);

    // Initialize file counts and file list
    let filesCounts: Types.FileCountsRecord = {};
    let files: string[] = [];

    // Before May 2021, G-NAF included a Counts.csv file for validation
    if (countsFileExists) {
        // Load the file counts from the CSV
        filesCounts = await loadFileCounts(countsFile);
        files = Object.keys(filesCounts);
        if (VERBOSE) logger("files", files);
    } else {
        // May 2021 onwards: Counts.csv was removed, so we need to count lines manually
        files = await getFiles(".", directory);

        // Count lines in each file (subtract 1 for header row)
        for (const file of files) {
            const lines = await countLinesInFile(`${directory}/${file}`);
            filesCounts[file] = lines - 1;
        }
    }

    // Initialize the load context which will accumulate authority code tables
    const loadContext: Types.LoadContext = {};

    // Load all authority code files (lookup tables for codes like street types, flat types, etc.)
    await loadAuthFiles(files, directory, loadContext, filesCounts);

    // Build synonym mappings from authority codes for enhanced search
    // This allows searching "RD" to match "ROAD", "ST" to match "STREET", etc.
    const synonyms = buildSynonyms(
        loadContext as unknown as Types.MapPropertyContext,
    );

    // Initialize the OpenSearch index with synonyms and appropriate mappings
    await initIndex(global.esClient, ES_CLEAR_INDEX, synonyms);

    // Find all ADDRESS_DETAIL files in the Standard directory for each state
    const addressDetailFiles = files.filter(
        (f) => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//),
    );
    if (VERBOSE) logger("addressDetailFiles", addressDetailFiles);

    // Determine which states to process
    const statesToProcess: string[] = [];
    for (const detailFile of addressDetailFiles) {
        const state = path
            .basename(detailFile, path.extname(detailFile))
            .replace(/_.*/, "");
        if (COVERED_STATES.length === 0 || COVERED_STATES.includes(state)) {
            statesToProcess.push(state);
        }
    }

    if (!getDaemonMode()) {
        logInfo(
            `Processing ${statesToProcess.length} state(s): ${statesToProcess.map(formatState).join(", ")}`,
        );
    }

    // Process each state's address detail file
    let stateIndex = 0;
    for (const detailFile of addressDetailFiles) {
        // Extract state abbreviation from filename (e.g., "NSW_ADDRESS_DETAIL_psv.psv" -> "NSW")
        const state = path
            .basename(detailFile, path.extname(detailFile))
            .replace(/_.*/, "");

        // Check if this state should be processed (based on COVERED_STATES environment variable)
        if (COVERED_STATES.length === 0 || COVERED_STATES.includes(state)) {
            stateIndex++;
            const stateProgress = `[${stateIndex}/${statesToProcess.length}]`;

            // Start state processing spinner
            const stateSpinner = startSpinner(
                `${stateProgress} Processing ${formatState(state)}...`,
            );

            // Set the current state in the load context
            loadContext.state = state;
            loadContext.stateName = await loadStateData(
                files,
                directory,
                state,
            );

            // Load street locality data and index by STREET_LOCALITY_PID
            updateSpinner(
                `${stateProgress} ${formatState(state)}: Loading streets...`,
            );
            if (VERBOSE) logger("Loading streets", state);
            const streetLocality = await loadStreetLocality(
                files,
                directory,
                state,
            );
            loadContext.streetLocalityIndexed = {};
            for (const sl of streetLocality) {
                loadContext.streetLocalityIndexed[sl.STREET_LOCALITY_PID] = sl;
            }

            // Load locality (suburb) data and index by LOCALITY_PID
            updateSpinner(
                `${stateProgress} ${formatState(state)}: Loading localities...`,
            );
            if (VERBOSE) logger("Loading suburbs", state);
            const locality = await loadLocality(files, directory, state);
            loadContext.localityIndexed = {};
            for (const l of locality) {
                loadContext.localityIndexed[l.LOCALITY_PID] = l;
            }

            // Optionally load geocode data if geocoding is enabled
            if (ENABLE_GEO) {
                // Load site geocodes (multiple geocodes per address site)
                updateSpinner(
                    `${stateProgress} ${formatState(state)}: Loading geocodes...`,
                );
                loadContext.geoIndexed = {};
                await loadSiteGeo(
                    files,
                    directory,
                    state,
                    loadContext,
                    filesCounts,
                );

                // Load default geocodes (one default per address detail)
                loadContext.geoDefaultIndexed = {};
                await loadDefaultGeo(
                    files,
                    directory,
                    state,
                    loadContext,
                    filesCounts,
                );
            } else {
                if (VERBOSE)
                    logger(
                        `Skipping geos. set 'ADDRESSKIT_ENABLE_GEO' env var to enable`,
                    );
            }

            // Load and index the address details for this state
            const expectedCount = filesCounts[detailFile] || 0;
            const indexingStartTime = Date.now();
            updateSpinner(
                `${stateProgress} ${formatState(state)}: Indexing ${formatNumber(expectedCount)} addresses...`,
            );
            await loadGNAFAddress(
                `${directory}/${detailFile}`,
                filesCounts[detailFile],
                loadContext as unknown as Types.MapPropertyContext,
                {
                    refresh,
                    onProgress: (progress) => {
                        // Build progress display with the terminalUI progress bar
                        const progressBar = createProgressBar(
                            progress.processed,
                            progress.total,
                            20,
                        );

                        // Format speed and ETA
                        const speed = formatNumber(progress.addressesPerSecond);
                        const processed = formatNumber(progress.processed);
                        const total = formatNumber(progress.total);
                        const eta =
                            progress.etaSeconds > 0
                                ? formatDuration(progress.etaSeconds * 1000)
                                : "calculating...";

                        // Update spinner text with detailed progress info
                        updateSpinner(
                            `${stateProgress} ${formatState(state)}: Indexing  ${progressBar}  ${theme.muted(`${processed} / ${total}`)}  ${theme.secondary(`${speed}/s`)}  ${theme.dim(`ETA: ${eta}`)}`,
                        );
                    },
                },
            );

            // Calculate total indexing duration for this state
            const indexingDuration = Date.now() - indexingStartTime;
            succeedSpinner(
                `${stateProgress} ${formatState(state)}: ${formatNumber(expectedCount)} addresses indexed in ${formatDuration(indexingDuration)}`,
            );
        }
    }
};

/**
 * Loads the full state name from the state PSV file for a given state abbreviation.
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param state - The state abbreviation (e.g., "NSW", "VIC", "QLD")
 *
 * @returns The full state name (e.g., "NEW SOUTH WALES") or undefined if not found
 * @throws {Error} If the state file cannot be parsed
 */
const loadStateData = async (
    files: string[],
    directory: string,
    state: string,
): Promise<string | undefined> => {
    // Find the state file matching the pattern (e.g., "NSW_STATE_psv.psv")
    const stateFile = files.find((f) =>
        f.match(new RegExp(`${state}_STATE_psv`)),
    );

    // Log error and return undefined if state file not found
    if (stateFile === undefined) {
        error(`Could not find state file '${state}_STATE_psv.psv'`);
        return undefined;
    }

    // Parse the state file to extract the full state name
    const name = await getStateName(state, `${directory}/${stateFile}`);
    return name;
};

/**
 * Loads street locality data from the STREET_LOCALITY PSV file for a given state.
 *
 * Street localities represent named streets within a locality (suburb).
 * Each record contains the street name, type (ROAD, STREET, etc.),
 * class, and optional suffix (N, S, E, W for directional streets).
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param state - The state abbreviation (e.g., "NSW", "VIC", "QLD")
 *
 * @returns An array of street locality records for the state
 * @throws {Error} If the file cannot be parsed
 */
const loadStreetLocality = async (
    files: string[],
    directory: string,
    state: string,
): Promise<Types.StreetLocalityRow[]> => {
    // Find the street locality file matching the pattern
    const localityFile = files.find((f) =>
        f.match(new RegExp(`${state}_STREET_LOCALITY_psv`)),
    );

    // Log error and return empty array if file not found
    if (localityFile === undefined) {
        error(
            `Could not find street locality file '${state}_STREET_LOCALITY_psv.psv'`,
        );
        return [];
    }

    // Parse the PSV file and return all street locality records
    return await new Promise<Types.StreetLocalityRow[]>((resolve, reject) => {
        Papa.parse(fs.createReadStream(`${directory}/${localityFile}`), {
            header: true,
            delimiter: "|",
            // On successful parse, resolve with the parsed data
            complete: (results: Papa.ParseResult<Types.StreetLocalityRow>) => {
                resolve(results.data);
            },
            // On error, log and reject the promise
            error: (parseError: Error, file: unknown) => {
                console.log(
                    "[loadStreetLocality] error parsing file",
                    parseError,
                    file,
                );
                reject(parseError);
            },
        });
    });
};

/**
 * Loads locality (suburb/town) data from the LOCALITY PSV file for a given state.
 *
 * Localities represent suburbs, towns, and other named areas. Each record
 * contains the locality name and its classification (e.g., GAZETTED LOCALITY).
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param state - The state abbreviation (e.g., "NSW", "VIC", "QLD")
 *
 * @returns An array of locality records for the state
 * @throws {Error} If the file cannot be parsed
 */
const loadLocality = async (
    files: string[],
    directory: string,
    state: string,
): Promise<Types.LocalityRow[]> => {
    // Find the locality file matching the pattern
    const localityFile = files.find((f) =>
        f.match(new RegExp(`${state}_LOCALITY_psv`)),
    );

    // Log error and return empty array if file not found
    if (localityFile === undefined) {
        error(`Could not find locality file '${state}_LOCALITY_psv.psv'`);
        return [];
    }

    // Parse the PSV file and return all locality records
    return await new Promise<Types.LocalityRow[]>((resolve, reject) => {
        Papa.parse(fs.createReadStream(`${directory}/${localityFile}`), {
            header: true,
            delimiter: "|",
            // On successful parse, resolve with the parsed data
            complete: (results: Papa.ParseResult<Types.LocalityRow>) => {
                resolve(results.data);
            },
            // On error, log and reject the promise
            error: (parseError: Error, file: unknown) => {
                console.log(
                    "[loadLocality] error parsing file",
                    parseError,
                    file,
                );
                reject(parseError);
            },
        });
    });
};

/**
 * Loads site geocode data from the ADDRESS_SITE_GEOCODE PSV file.
 *
 * Site geocodes provide geographic coordinates for address sites. An address
 * site may have multiple geocodes with different types (e.g., PROPERTY CENTROID,
 * FRONTAGE CENTRE) and reliability levels.
 *
 * This function uses chunked parsing to handle large files efficiently and
 * indexes the geocodes by ADDRESS_SITE_PID in the load context for fast lookup.
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param state - The state abbreviation (e.g., "NSW", "VIC", "QLD")
 * @param loadContext - The load context to store indexed geocodes
 * @param filesCounts - Record of expected row counts for validation/progress
 *
 * @returns A promise that resolves when all geocodes are indexed
 * @throws {Error} If the file cannot be parsed
 */
const loadSiteGeo = async (
    files: string[],
    directory: string,
    state: string,
    loadContext: Types.LoadContext,
    filesCounts: Types.FileCountsRecord,
): Promise<void> => {
    if (VERBOSE) logger("Loading site geos");

    // Find the site geocode file matching the pattern
    const geoFile = files.find((f) =>
        f.match(new RegExp(`${state}_ADDRESS_SITE_GEOCODE_psv`)),
    );

    // Log error and return if file not found
    if (geoFile === undefined) {
        error(
            `Could not find address site geocode file '${state}_ADDRESS_SITE_GEOCODE_psv.psv'`,
        );
        return;
    }

    // Get expected count for progress logging
    const expectedCount = filesCounts[geoFile];
    let count = 0;

    // Parse the file in chunks for memory efficiency
    return await new Promise<void>((resolve, reject) => {
        Papa.parse(fs.createReadStream(`${directory}/${geoFile}`), {
            header: true,
            delimiter: "|",
            // Process each chunk of parsed data
            chunk: (
                chunk: Papa.ParseResult<Types.SiteGeocodeRow>,
                parser: Papa.Parser,
            ) => {
                // Pause parser while processing chunk
                parser.pause();

                // Check for parsing errors
                if (chunk.errors.length > 0) {
                    error(
                        `Errors reading '${directory}/${geoFile}': ${chunk.errors}`,
                    );
                    error({ errors: chunk.errors });
                } else {
                    // Index each geocode row by ADDRESS_SITE_PID
                    for (const row of chunk.data) {
                        // Log progress at 1% intervals
                        if (expectedCount) {
                            if (count % Math.ceil(expectedCount / 100) === 0) {
                                if (VERBOSE)
                                    logger(
                                        `${Math.floor(
                                            (count / expectedCount) * 100,
                                        )}% (${count}/ ${expectedCount})`,
                                    );
                            }
                        }

                        // Index the geocode by ADDRESS_SITE_PID (may have multiple per site)
                        const sitePid = row.ADDRESS_SITE_PID;
                        if (loadContext.geoIndexed?.[sitePid] === undefined) {
                            // biome-ignore lint/style/noNonNullAssertion: This is a valid use case
                            loadContext.geoIndexed![sitePid] = [row];
                        } else {
                            loadContext.geoIndexed?.[sitePid].push(row);
                        }
                        count += 1;
                    }

                    // Resume parser after processing chunk
                    parser.resume();
                }
            },
            // Resolve when parsing is complete
            complete: () => {
                resolve();
            },
            // Reject on error
            error: (parseError: Error, file: unknown) => {
                console.log(
                    "[loadSiteGeo] error parsing file",
                    parseError,
                    file,
                );
                reject(parseError);
            },
        });
    });
};

/**
 * Loads default geocode data from the ADDRESS_DEFAULT_GEOCODE PSV file.
 *
 * Default geocodes provide the primary geographic coordinate for each address
 * detail. Unlike site geocodes which may have multiple per site, each address
 * detail has exactly one default geocode.
 *
 * This function uses chunked parsing to handle large files efficiently and
 * indexes the geocodes by ADDRESS_DETAIL_PID in the load context for fast lookup.
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param state - The state abbreviation (e.g., "NSW", "VIC", "QLD")
 * @param loadContext - The load context to store indexed geocodes
 * @param filesCounts - Record of expected row counts for validation/progress
 *
 * @returns A promise that resolves when all geocodes are indexed
 * @throws {Error} If the file cannot be parsed
 */
const loadDefaultGeo = async (
    files: string[],
    directory: string,
    state: string,
    loadContext: Types.LoadContext,
    filesCounts: Types.FileCountsRecord,
): Promise<void> => {
    if (VERBOSE) logger("Loading default geos");

    // Find the default geocode file matching the pattern
    const geoFile = files.find((f) =>
        f.match(new RegExp(`${state}_ADDRESS_DEFAULT_GEOCODE_psv`)),
    );

    // Log error and return if file not found
    if (geoFile === undefined) {
        error(
            `Could not find address site geocode file '${state}_ADDRESS_DEFAULT_GEOCODE_psv.psv'`,
        );
        return;
    }

    // Get expected count for progress logging
    const expectedCount = filesCounts[geoFile];
    let count = 0;

    // Parse the file in chunks for memory efficiency
    return await new Promise<void>((resolve, reject) => {
        Papa.parse(fs.createReadStream(`${directory}/${geoFile}`), {
            header: true,
            delimiter: "|",
            // Process each chunk of parsed data
            chunk: (
                chunk: Papa.ParseResult<Types.DefaultGeocodeRow>,
                parser: Papa.Parser,
            ) => {
                // Pause parser while processing chunk
                parser.pause();

                // Check for parsing errors
                if (chunk.errors.length > 0) {
                    error(
                        `Errors reading '${directory}/${geoFile}': ${chunk.errors}`,
                    );
                    error({ errors: chunk.errors });
                } else {
                    // Index each geocode row by ADDRESS_DETAIL_PID
                    for (const row of chunk.data) {
                        // Log progress at 1% intervals
                        if (expectedCount) {
                            if (count % Math.ceil(expectedCount / 100) === 0) {
                                if (VERBOSE)
                                    logger(
                                        `${Math.floor(
                                            (count / expectedCount) * 100,
                                        )}% (${count}/ ${expectedCount})`,
                                    );
                            }
                        }

                        // Index the geocode by ADDRESS_DETAIL_PID (may have multiple per detail)
                        const detailPid = row.ADDRESS_DETAIL_PID;
                        if (
                            loadContext.geoDefaultIndexed?.[detailPid] ===
                            undefined
                        ) {
                            // biome-ignore lint/style/noNonNullAssertion: This is a valid use case
                            loadContext.geoDefaultIndexed![detailPid] = [row];
                        } else {
                            loadContext.geoDefaultIndexed[detailPid].push(row);
                        }
                        count += 1;
                    }

                    // Resume parser after processing chunk
                    parser.resume();
                }
            },
            // Resolve when parsing is complete
            complete: () => {
                resolve();
            },
            // Reject on error
            error: (parseError: Error, file: unknown) => {
                console.log(
                    "[loadDefaultGeo] error parsing file",
                    parseError,
                    file,
                );
                reject(parseError);
            },
        });
    });
};

/**
 * Loads all authority code (lookup) files from the G-NAF data directory.
 *
 * Authority code files contain lookup tables that map codes to human-readable
 * names. Examples include:
 * - STREET_TYPE_AUT: Maps "RD" to "ROAD", "ST" to "STREET"
 * - FLAT_TYPE_AUT: Maps "UNIT" to "UNIT", "APT" to "APARTMENT"
 * - LEVEL_TYPE_AUT: Maps "L" to "LEVEL", "FL" to "FLOOR"
 *
 * These tables are loaded into the load context for use when mapping address
 * details to their full structured representation.
 *
 * @param files - Array of all file paths in the G-NAF directory
 * @param directory - The base directory path containing G-NAF files
 * @param loadContext - The load context to store authority code tables
 * @param filesCounts - Record of expected row counts for validation
 *
 * @returns A promise that resolves when all authority files are loaded
 * @throws {Error} If a file cannot be parsed or row count doesn't match
 */
const loadAuthFiles = async (
    files: string[],
    directory: string,
    loadContext: Types.LoadContext,
    filesCounts: Types.FileCountsRecord,
): Promise<void> => {
    // Find all authority code files (files containing "Authority Code" in path)
    const authCodeFiles = files.filter((f) => f.match(/Authority Code/));
    if (VERBOSE) logger("authCodeFiles", authCodeFiles);

    // Process each authority code file
    for (const authFile of authCodeFiles) {
        // Extract the context key from the filename (e.g., "Authority_Code_STREET_TYPE_AUT_psv")
        const contextKey = path.basename(authFile, path.extname(authFile));

        // Parse the authority code file
        await new Promise<void>((resolve, reject) => {
            Papa.parse(fs.createReadStream(`${directory}/${authFile}`), {
                delimiter: "|",
                header: true,
                // On successful parse, store the data in the load context
                complete: (
                    results: Papa.ParseResult<Record<string, string>>,
                ) => {
                    // Store parsed data under the context key
                    loadContext[contextKey] = results.data;

                    // Validate row count if file counts are provided
                    if (filesCounts) {
                        if (results.data.length !== filesCounts[authFile]) {
                            // Row count mismatch - log error and reject
                            error(
                                `Error loading '${directory}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`,
                            );
                            reject(
                                new Error(
                                    `Error loading '${directory}/${authFile}'. Expected '${filesCounts[authFile]}' rows, got '${results.data.length}'`,
                                ),
                            );
                        } else {
                            // Row count matches - log success and resolve
                            if (VERBOSE)
                                logger(
                                    `loaded '${results.data.length}' rows from '${directory}/${authFile}' into key '${contextKey}'`,
                                );
                            resolve();
                        }
                    } else {
                        // No file counts to validate - just resolve
                        resolve();
                    }
                },
                // On error, log and reject
                error: (parseError: Error, file: unknown) => {
                    error(
                        `Error loading '${directory}/${authFile}`,
                        parseError,
                        file,
                    );
                    reject(
                        new Error(
                            `Error loading '${directory}/${authFile}: ${parseError.message}`,
                        ),
                    );
                },
            });
        });
    }

    // Log the complete load context for debugging
    if (VERBOSE) logger("AUTH", loadContext);
};

/**
 * Main entry point for loading G-NAF data into the address search index.
 *
 * This function orchestrates the entire GNAF loading workflow:
 * 1. Fetches the latest G-NAF ZIP file from data.gov.au (or uses cached copy)
 * 2. Extracts the ZIP file to a local directory
 * 3. Locates the G-NAF data directory within the extracted contents
 * 4. Loads all data files into the OpenSearch index
 *
 * The loading process respects the COVERED_STATES environment variable to
 * optionally limit which states are processed. When dynamic resources are
 * enabled, the loader adapts to available system memory for optimal performance.
 *
 * @alias loadGnaf
 *
 * @param options - Optional loading configuration
 * @param options.refresh - Whether to refresh the index after loading (default: false)
 *
 * @returns A promise that resolves when all data is loaded
 * @throws {Error} If the G-NAF data cannot be downloaded, extracted, or loaded
 */
export const loadCommandEntry = async ({
    refresh = false,
}: { refresh?: boolean } = {}): Promise<void> => {
    // Initialize resource monitoring if dynamic resources are enabled
    const resourceMonitor = DYNAMIC_RESOURCES_ENABLED
        ? ResourceMonitor.getInstance()
        : undefined;

    if (resourceMonitor) {
        // Log initial resource state for debugging and capacity planning
        resourceMonitor.logResourceReport();

        // Start monitoring to track memory usage during loading
        resourceMonitor.startMonitoring();

        // Register memory pressure callback to log warnings
        resourceMonitor.onMemoryPressure((snapshot) => {
            const msg = `Memory pressure: ${formatBytes(snapshot.freeMemory)} free, heap: ${formatBytes(snapshot.heapUsed)}`;
            if (VERBOSE) logger(msg);
            if (!getDaemonMode()) {
                logWarning(msg);
            }
        });
    }

    try {
        // Clear cached authority code Maps to ensure fresh lookups
        // This is essential when reloading data to avoid stale mappings
        clearAuthorityCodeMaps();

        // Step 1: Fetch the G-NAF ZIP file (downloads if not cached or outdated)
        const fetchSpinner = startSpinner(
            "Fetching G-NAF package information...",
        );
        let file: string;
        try {
            file = await fetchGNAFArchive();
            succeedSpinner("G-NAF package located");
        } catch (err) {
            failSpinner("Failed to fetch G-NAF package");
            throw err;
        }

        // Step 2: Extract the ZIP file to a local directory
        const extractSpinner = startSpinner("Extracting G-NAF archive...");
        let unzipped: string;
        try {
            unzipped = await unzipGNAFArchive(file);
            succeedSpinner("G-NAF archive extracted");
        } catch (err) {
            failSpinner("Failed to extract G-NAF archive");
            throw err;
        }

        // Log the extracted directory path
        if (VERBOSE) logger("Data dir", unzipped);

        // Step 3: Read the contents of the extracted directory
        const contents = await fsp.readdir(unzipped);
        if (VERBOSE) logger("Data dir contents", contents);

        // Verify the directory is not empty
        if (contents.length === 0) {
            throw new Error(`Data dir '${unzipped}' is empty`);
        }

        // Step 4: Find the G-NAF subdirectory within the extracted contents
        const locateSpinner = startSpinner("Locating G-NAF data directory...");
        const gnafDir = await glob("**/G-NAF/", { cwd: unzipped });
        if (VERBOSE) logger("gnafDir", gnafDir);

        // Verify the G-NAF directory was found
        if (gnafDir.length === 0) {
            failSpinner("G-NAF directory not found");
            throw new Error(
                `Cannot find 'G-NAF' directory in Data dir '${unzipped}'`,
            );
        }
        succeedSpinner("G-NAF data directory located");

        // Get the parent directory of the G-NAF folder (this is the main data directory)
        const mainDirectory = path.dirname(
            `${unzipped}/${gnafDir[0].slice(0, -1)}`,
        );
        if (VERBOSE) logger("Main Data dir", mainDirectory);

        // Log resource state before the intensive loading phase
        if (resourceMonitor) {
            if (VERBOSE) logger("Starting data loading phase");
            resourceMonitor.logResourceReport();
        }

        // Step 5: Load all G-NAF data from the main directory
        const loadSpinner = startSpinner("Loading address data into index...");
        try {
            await initGNAFDataLoader(mainDirectory, { refresh });
            succeedSpinner("Address data loaded into index");
        } catch (err) {
            failSpinner("Failed to load address data");
            throw err;
        }

        // Log final resource state after loading completes
        if (resourceMonitor) {
            if (VERBOSE) logger("Data loading complete");
            resourceMonitor.logResourceReport();
        }
    } finally {
        // Always stop resource monitoring when done
        if (resourceMonitor) {
            resourceMonitor.stopMonitoring();
        }
    }
};
