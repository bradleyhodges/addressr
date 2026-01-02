import { esConnect } from "@repo/addresskit-client/elasticsearch";
import debug from "debug";
import service from "./service";
import { printVersion } from "./service/printVersion";

/**
 * The logger for the API.
 */
const logger = debug("api");

/**
 * The logger for errors.
 */
const error = debug("error");

/**
 * If the DEBUG environment variable is not set, enable the API and error loggers
 */
if (process.env.DEBUG === undefined) {
    debug.enable("api,error");
}

/**
 * Loads G-NAF data into OpenSearch, measuring execution time.
 */
async function runLoader(): Promise<void> {
    // Get the start time
    const start = process.hrtime();

    // Connect to the Elasticsearch client
    await esConnect();
    if (VERBOSE) logger("es client connected");

    // Print the version and environment
    console.log("======================");
    console.log("AddressKit - Data Loader");
    console.log("=======================");
    printVersion();

    // Load the G-NAF data
    await service.load();
    if (VERBOSE) logger("data loaded");

    // Get the end time
    const end = process.hrtime(start);
    if (VERBOSE) logger(`Execution time: ${end[0]}s ${end[1] / 1_000_000}ms`);
    if (VERBOSE) logger("Fin");
}

/**
 * Run the loader and catch any errors
 *
 * @param error_ - The error
 * @returns {Promise<void>}
 */
void runLoader().catch((error_) => {
    error("error loading data", error_);
    throw error_;
});
