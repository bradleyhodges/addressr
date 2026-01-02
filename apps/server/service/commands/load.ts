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
    ES_INDEX_NAME,
    GNAF_DIR,
    GNAF_PACKAGE_URL,
    ONE_DAY_MS,
    THIRTY_DAYS_MS,
} from "../conf";
import { buildSynonyms, mapAddressDetails } from "../helpers";
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
    logger("cached gnaf package data", cachedResponse);

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
        logger("created", created);

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
        logger("response.isFromCache", response.fromCache);
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
    logger("dataResource", JSON.stringify(dataResource, undefined, 2));
    logger("url", dataResource.url);
    logger("headers", JSON.stringify(response.headers, undefined, 2));

    // Get the basename of the GNAF file
    const basename = path.basename(dataResource.url);
    logger("basename", basename);

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

        // The destination file exists, so don't bother trying to download it again
        return destination;
    } catch {
        // The destination file does not exist, so we need to download it.
        logger("Starting G-NAF download");
        try {
            // Download the GNAF file
            await download(
                dataResource.url,
                `${incomplete_path}/${basename}`,
                dataResource.size,
            );

            // Rename the GNAF file
            await fsp.rename(`${incomplete_path}/${basename}`, destination);
            logger("Finished downloading G-NAF", destination);

            // Return the destination path
            return destination;
        } catch (error_) {
            // Log the error
            error("Error downloading G-NAF", error_);

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
        logger("directory exits. Skipping extract", complete_path);
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
    logger("before pipe");

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
                                            logger(
                                                "skipping extract for",
                                                entryPath,
                                            );
                                            entry.autodrain();
                                            callback();
                                        } else {
                                            // The size of the entry is different from the size of the file, so we need to extract
                                            // the file. Pipe the entry to the write stream
                                            logger("extracting", entryPath);
                                            entry
                                                .pipe(
                                                    fs.createWriteStream(
                                                        entryPath,
                                                    ),
                                                )
                                                // On finish, log the message and call the callback
                                                .on("finish", () => {
                                                    logger(
                                                        "finished extracting",
                                                        entryPath,
                                                    );
                                                    callback();
                                                })
                                                // On error, log the message and call the callback
                                                .on("error", (error: Error) => {
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
                logger("finish");
                resolve();
            })
            // On error, log the message and call the callback
            .on("error", (error_) => {
                logger("error unzipping data file", error_);
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
 * Loads the GNAF address details into the index.
 *
 * @alias loadAddressDetails
 *
 * @param file - The path to the GNAF file.
 * @param expectedCount - The expected number of rows in the GNAF file.
 * @param context - The context containing the authority code tables.
 * @param refresh - Whether to refresh the index.
 *
 * @returns {Promise<void>} - A promise that resolves when the GNAF address details are loaded into the index.
 */
const loadGNAFAddress = async (
    file: string,
    expectedCount: number,
    context: Types.MapPropertyContext,
    { refresh = false } = {},
): Promise<void> => {
    // Initialize the actual count
    let actualCount = 0;

    // Create a promise to load the GNAF address details into the index
    await new Promise<void>((resolve, reject) => {
        // Parse the GNAF file
        Papa.parse(fs.createReadStream(file), {
            header: true,
            skipEmptyLines: true,
            chunkSize:
                Number.parseInt(
                    process.env.ADDRESSKIT_LOADING_CHUNK_SIZE || "10",
                ) *
                1024 *
                1024,
            chunk: (
                chunk: Papa.ParseResult<Types.AddressDetailRow>,
                parser: Papa.Parser,
            ) => {
                // Pause the parser
                parser.pause();

                // Create a list to store the items
                const items: Types.AddressDetails[] = [];

                // If there are errors, log the errors
                if (chunk.errors.length > 0) {
                    error(`Errors reading '${file}': ${chunk.errors}`);
                    error({ errors: chunk.errors });
                }

                // Create a list to store the indexing body
                const indexingBody: Types.BulkIndexBody = [];
                for (const row of chunk.data) {
                    // Map the row to a structured address
                    const item = mapAddressDetails(
                        row,
                        context,
                        actualCount,
                        expectedCount,
                    );

                    // Add the item to the list of items
                    items.push(item);

                    // Increment the actual count
                    actualCount += 1;

                    // Add the index operation to the indexing body
                    indexingBody.push({
                        index: {
                            _index: ES_INDEX_NAME,
                            _id: `/addresses/${item.pid}`,
                        },
                    });

                    // Add the address details to the indexing body
                    const { sla, ssla, ...structured } = item;
                    indexingBody.push({
                        sla,
                        ssla,
                        structured,
                        confidence: structured.structured.confidence,
                    });
                }

                // If there are items to process, send the index request
                if (indexingBody.length > 0) {
                    sendIndexRequest(indexingBody, undefined, { refresh })
                        .then(() => {
                            parser.resume();
                            return;
                        })
                        // On error, log the error and throw it
                        .catch((error_: Error) => {
                            error("error sending index request", error_);
                            throw error_;
                        });
                } else {
                    // nothing to process. Have reached end of file.
                    parser.resume();
                }
            },
            // On complete, log the message and call the callback
            complete: () => {
                logger(
                    "Address details loaded",
                    context.state,
                    expectedCount || "",
                );
                resolve();
            },
            error: (_error, file) => {
                error(_error, file);
                reject();
            },
        });
    });

    // If the expected count is not undefined and the actual count is not equal to the expected count, log the error
    if (expectedCount !== undefined && actualCount !== expectedCount) {
        // Log the error
        error(
            `Error loading '${file}'. Expected '${expectedCount}' rows, got '${actualCount}'`,
        );
    } else {
        // Log the message
        logger(`loaded '${actualCount}' rows from '${file}'`);
    }
};

/**
 * Sends an request to the OpenSearch database to bulk index the addresses.
 *
 * @alias sendIndexRequest
 *
 * @param indexingBody - The indexing body.
 * @param initialBackoff
 * @param refresh - Whether to refresh the index.
 *
 * @returns {Promise<void>} - A promise that resolves when the index request is sent.
 * @throws {Error} If the index request cannot be sent.
 */
export const sendIndexRequest = async (
    indexingBody: Types.BulkIndexBody,
    initialBackoff: number = Number.parseInt(
        process.env.ADDRESSKIT_INDEX_BACKOFF || "30000",
    ),
    { refresh = false }: { refresh?: boolean } = {},
): Promise<void> => {
    // Initialize the backoff
    let backoff = initialBackoff;

    // Loop until the index request is sent
    // biome-ignore lint/correctness/noConstantCondition: This is a loop that will run until it succeeds
    for (let count = 0; true; count++) {
        try {
            // Send the index request
            const resp = (await (
                global.esClient as Types.OpensearchClient
            ).bulk({
                refresh,
                body: indexingBody,
                timeout: process.env.ADDRESSKIT_INDEX_TIMEOUT || "300s",
            })) as Types.OpensearchApiResponse<
                Record<string, unknown>,
                unknown
            > & {
                errors?: boolean | undefined;
            };

            // If there are errors, throw the response
            if (resp?.errors || resp.body?.errors) throw resp;
            return;
        } catch (error_) {
            // If there is an error, log the error and throw it
            error("Indexing error", JSON.stringify(error_, undefined, 2));

            // Back off for the next request
            error(`backing off for ${backoff}ms`);
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(void 0);
                }, backoff);
            });

            // Increment the backoff
            backoff += Number.parseInt(
                process.env.ADDRESSKIT_INDEX_BACKOFF_INCREMENT || "30000",
            );

            // Set the backoff to the minimum of the maximum backoff and the current backoff
            backoff = Math.min(
                Number.parseInt(
                    process.env.ADDRESSKIT_INDEX_BACKOFF_MAX || "600000",
                ),
                backoff,
            );

            // Log the next backoff
            error(`next backoff: ${backoff}ms`);
            error(`count: ${count}`);
        }
    }
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
        logger("files", files);
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
    await initIndex(
        global.esClient,
        process.env.ES_CLEAR_INDEX === "true",
        synonyms,
    );

    // Find all ADDRESS_DETAIL files in the Standard directory for each state
    const addressDetailFiles = files.filter(
        (f) => f.match(/ADDRESS_DETAIL/) && f.match(/\/Standard\//),
    );
    logger("addressDetailFiles", addressDetailFiles);

    // Process each state's address detail file
    for (const detailFile of addressDetailFiles) {
        // Extract state abbreviation from filename (e.g., "NSW_ADDRESS_DETAIL_psv.psv" -> "NSW")
        const state = path
            .basename(detailFile, path.extname(detailFile))
            .replace(/_.*/, "");

        // Check if this state should be processed (based on COVERED_STATES environment variable)
        if (COVERED_STATES.length === 0 || COVERED_STATES.includes(state)) {
            // Set the current state in the load context
            loadContext.state = state;
            loadContext.stateName = await loadStateData(
                files,
                directory,
                state,
            );

            // Load street locality data and index by STREET_LOCALITY_PID
            logger("Loading streets", state);
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
            logger("Loading suburbs", state);
            const locality = await loadLocality(files, directory, state);
            loadContext.localityIndexed = {};
            for (const l of locality) {
                loadContext.localityIndexed[l.LOCALITY_PID] = l;
            }

            // Optionally load geocode data if ADDRESSKIT_ENABLE_GEO is set
            if (process.env.ADDRESSKIT_ENABLE_GEO) {
                // Load site geocodes (multiple geocodes per address site)
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
                logger(
                    `Skipping geos. set 'ADDRESSKIT_ENABLE_GEO' env var to enable`,
                );
            }

            // Load and index the address details for this state
            await loadGNAFAddress(
                `${directory}/${detailFile}`,
                filesCounts[detailFile],
                loadContext as unknown as Types.MapPropertyContext,
                { refresh },
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
    logger("Loading site geos");

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
    logger("Loading default geos");

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
    logger("authCodeFiles", authCodeFiles);

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
    logger("AUTH", loadContext);
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
 * optionally limit which states are processed.
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
    // Step 1: Fetch the G-NAF ZIP file (downloads if not cached or outdated)
    const file = await fetchGNAFArchive();

    // Step 2: Extract the ZIP file to a local directory
    const unzipped = await unzipGNAFArchive(file);

    // Log the extracted directory path
    logger("Data dir", unzipped);

    // Step 3: Read the contents of the extracted directory
    const contents = await fsp.readdir(unzipped);
    logger("Data dir contents", contents);

    // Verify the directory is not empty
    if (contents.length === 0) {
        throw new Error(`Data dir '${unzipped}' is empty`);
    }

    // Step 4: Find the G-NAF subdirectory within the extracted contents
    const gnafDir = await glob("**/G-NAF/", { cwd: unzipped });
    console.log(gnafDir);

    // Verify the G-NAF directory was found
    if (gnafDir.length === 0) {
        throw new Error(
            `Cannot find 'G-NAF' directory in Data dir '${unzipped}'`,
        );
    }

    // Get the parent directory of the G-NAF folder (this is the main data directory)
    const mainDirectory = path.dirname(
        `${unzipped}/${gnafDir[0].slice(0, -1)}`,
    );
    logger("Main Data dir", mainDirectory);

    // Step 5: Load all G-NAF data from the main directory
    await initGNAFDataLoader(mainDirectory, { refresh });
};
