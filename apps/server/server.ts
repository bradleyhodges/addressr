import { esConnect } from "@repo/addresskit-client/elasticsearch";
import debug from "debug";
import { printVersion } from "./service/printVersion";
import { startServer } from "./swagger";

/**
 * The logger for the API.
 */
const logger = debug("api");

/**
 * Boots the HTTP API then connects the shared OpenSearch client.
 *
 * This runs the HTTP server first so health endpoints come up quickly,
 * then establishes the expensive OpenSearch connection and stores it
 * on the global scope for downstream handlers.
 */
async function bootstrap(): Promise<void> {
    // Start the server
    await startServer();
    if (VERBOSE) logger("server started");

    // Connect to the Elasticsearch client
    if (VERBOSE) logger("connecting es client");
    const esClient = await esConnect();

    // Set the Elasticsearch client on the global scope
    global.esClient = esClient;
    if (VERBOSE) logger("es client connected");

    // Print the version and environment
    console.log("=======================");
    console.log("AddressKit - API Server");
    console.log("=======================");
    printVersion();
}

/**
 * Bootstrap the server and catch any errors
 *
 * @param error - The error
 * @returns {Promise<void>}
 */
void bootstrap().catch((error) => {
    if (VERBOSE) logger("server bootstrap failed", error);
    throw error;
});
