import { esConnect } from "@repo/addresskit-client/elasticsearch";
import debug from "debug";
import { printVersion } from "../service/printVersion";
import { startRest2Server } from "./waycharterServer";

const logger = debug("api");

declare global {
    // eslint-disable-next-line no-var
    var esClient: Awaited<ReturnType<typeof esConnect>>;
}

/**
 * Connects to Elasticsearch and stores the client on the global namespace for reuse.
 *
 * @returns {Promise<void>} Resolves when the client is available for downstream modules.
 * @throws {Error} When the Elasticsearch client cannot be created.
 */
async function connectElasticSearchClient(): Promise<void> {
    // Connect to Elasticsearch
    const esClient = await esConnect();

    // Set the Elasticsearch client on the global namespace
    global.esClient = esClient;
    if (VERBOSE) logger("es client connected");
}

/**
 * Boots the REST server, establishes shared dependencies, and prints build metadata.
 *
 * @returns {Promise<void>} Resolves when startup routines finish.
 * @throws {Error} When the REST server or Elasticsearch client fails to start.
 */
async function bootstrapServer(): Promise<void> {
    // Start the REST server
    if (VERBOSE) logger("starting REST server");
    await startRest2Server();

    // Connect to Elasticsearch
    if (VERBOSE) logger("connecting es client");
    await connectElasticSearchClient();

    // Print the version and environment
    console.log("=======================");
    console.log("AddressKit - API Server 2");
    console.log("=======================");
    printVersion();
}

// Bootstrap the server
void bootstrapServer();
