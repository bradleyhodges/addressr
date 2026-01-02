Object.defineProperty(exports, "__esModule", { value: true });
exports.ELASTIC_PORT = void 0;
exports.dropIndex = dropIndex;
exports.initIndex = initIndex;
exports.esConnect = esConnect;
const opensearch_1 = require("@opensearch-project/opensearch");
const debug_1 = require("debug");
/**
 * The wait-port function.
 */
const waitPort = require("wait-port");
/**
 * The logger for the API.
 */
const logger = (0, debug_1.default)("api");
/**
 * The logger for errors.
 */
const error = (0, debug_1.default)("error");
/**
 * The name of the Elasticsearch index.
 */
const ES_INDEX_NAME = process.env.ES_INDEX_NAME ?? "addresskit";
/**
 * Configuration values for the Elasticsearch server
 */
exports.ELASTIC_PORT = Number.parseInt(process.env.ELASTIC_PORT ?? "9200", 10);
const ELASTIC_HOST = process.env.ELASTIC_HOST ?? "127.0.0.1";
const ELASTIC_USERNAME = process.env.ELASTIC_USERNAME ?? undefined;
const ELASTIC_PASSWORD = process.env.ELASTIC_PASSWORD ?? undefined;
const ELASTIC_PROTOCOL = process.env.ELASTIC_PROTOCOL ?? "http";
/**
 * Drops the configured OpenSearch index if it exists.
 *
 * @param {Client} esClient - Connected OpenSearch client.
 * @returns {Promise<void>} Resolves after the index is removed or confirmed absent.
 */
async function dropIndex(esClient) {
    // Check if the index exists
    const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
    // If the index exists, delete it
    if (exists.body === true) {
        const deleteIndexResult = await esClient.indices.delete({
            index: ES_INDEX_NAME,
        });
        // Log the result
        logger({ deleteIndexResult });
    }
    // Check if the index exists again
    const postExists = await esClient.indices.exists({ index: ES_INDEX_NAME });
    // Log the result
    logger("index exists:", postExists);
}
/**
 * Ensures the address index exists and is configured with analyzers and mappings.
 *
 * @param {Client} esClient - Connected OpenSearch client.
 * @param {boolean} [clear] - When true, drop the index before recreating.
 * @param {SynonymsList} [synonyms] - Optional synonyms list to seed the analyzer.
 * @returns {Promise<void>} Resolves once the index is ready.
 */
async function initIndex(esClient, clear, synonyms) {
    // If the clear flag is set, drop the index
    if (clear) await dropIndex(esClient);
    // Check if the index exists
    const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
    logger("index exists:", exists.body);
    // Build the index body
    const indexBody = {
        settings: {
            index: {
                analysis: {
                    filter: {
                        my_synonym_filter: {
                            type: "synonym",
                            lenient: true,
                            synonyms,
                        },
                        comma_stripper: {
                            type: "pattern_replace",
                            pattern: ",",
                            replacement: "",
                        },
                    },
                    analyzer: {
                        my_analyzer: {
                            tokenizer: "whitecomma",
                            filter: [
                                "uppercase",
                                "asciifolding",
                                "my_synonym_filter",
                                "comma_stripper",
                                "trim",
                            ],
                        },
                    },
                    tokenizer: {
                        whitecomma: {
                            type: "pattern",
                            pattern: "[\\W,]+",
                            lowercase: false,
                        },
                    },
                },
            },
        },
        aliases: {},
        mappings: {
            properties: {
                structured: {
                    type: "object",
                    enabled: false,
                },
                sla: {
                    type: "text",
                    analyzer: "my_analyzer",
                    fields: {
                        raw: {
                            type: "keyword",
                        },
                    },
                },
                ssla: {
                    type: "text",
                    analyzer: "my_analyzer",
                    fields: {
                        raw: {
                            type: "keyword",
                        },
                    },
                },
                confidence: { type: "integer" },
            },
        },
    };
    // If the index does not exist, create it
    if (exists.body !== true) {
        logger(`creating index: ${ES_INDEX_NAME}`);
        const indexCreateResult = await esClient.indices.create({
            index: ES_INDEX_NAME,
            body: indexBody,
        });
        logger({ indexCreateResult });
    } else {
        // When the index already exists, update settings and mappings then reopen.
        const indexCloseResult = await esClient.indices.close({
            index: ES_INDEX_NAME,
        });
        logger({ indexCloseResult });
        const indexPutSettingsResult = await esClient.indices.putSettings({
            index: ES_INDEX_NAME,
            body: indexBody,
        });
        logger({ indexPutSettingsResult });
        const indexPutMappingResult = await esClient.indices.putMapping({
            index: ES_INDEX_NAME,
            body: indexBody.mappings,
        });
        logger({ indexPutMappingResult });
        const indexOpenResult = await esClient.indices.open({
            index: ES_INDEX_NAME,
        });
        logger({ indexOpenResult });
        const refreshResult = await esClient.indices.refresh({
            index: ES_INDEX_NAME,
        });
        logger({ refreshResult });
    }
    // Get the index
    const indexGetResult = await esClient.indices.get({
        index: ES_INDEX_NAME,
        include_defaults: true,
    });
    // Log the result
    if (VERBOSE)
        logger(
            `indexGetResult:\n${JSON.stringify(indexGetResult, undefined, 2)}`,
        );
}
/**
 * Connects to OpenSearch, waiting for the port to be reachable and retrying until success.
 *
 * @param {number} [esport=ELASTIC_PORT] - Target OpenSearch port.
 * @param {string} [eshost=ELASTIC_HOST] - Target OpenSearch host.
 * @param {number} [interval=1000] - Retry interval in milliseconds.
 * @param {number} [timeout=0] - Timeout in milliseconds (0 means wait indefinitely).
 * @returns {Promise<Client>} Resolved OpenSearch client bound to `global.esClient`.
 * @throws {Error} When connection attempts continually fail (propagates last error).
 */
async function esConnect(
    esport = exports.ELASTIC_PORT,
    eshost = ELASTIC_HOST,
    interval = 1000,
    timeout = 0,
) {
    // Keep trying until the host:port is reachable.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (VERBOSE)
            logger(`trying to reach elastic search on ${eshost}:${esport}...`);
        try {
            // Check if the host:port is reachable
            const open = await waitPort({
                host: eshost,
                port: esport,
                interval,
                timeout,
            });
            // If the host:port is reachable, log it
            if (open) {
                if (VERBOSE) logger(`...${eshost}:${esport} is reachable`);
                // Keep retrying client creation until OpenSearch responds.
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    // Try to create a new client
                    try {
                        // Build the node URL
                        const node = ELASTIC_USERNAME
                            ? `${ELASTIC_PROTOCOL}://${ELASTIC_USERNAME}:${ELASTIC_PASSWORD}@${eshost}:${esport}`
                            : `${ELASTIC_PROTOCOL}://${eshost}:${esport}`;
                        // Build the client options
                        const esClientOptions = {
                            node,
                        };
                        // Create a new client
                        const esClient = new opensearch_1.Client(
                            esClientOptions,
                        );
                        if (VERBOSE)
                            logger(
                                `connecting elastic search client on ${eshost}:${esport}...`,
                            );
                        // Ping the client
                        await esClient.ping();
                        if (VERBOSE)
                            logger(`...connected to ${eshost}:${esport}`);
                        // Set the client in the global scope
                        global.esClient = esClient;
                        return esClient;
                    } catch (error_) {
                        // Log the error
                        error(
                            `An error occurred while trying to connect the elastic search client on ${eshost}:${esport}`,
                            error_,
                        );
                        // Wait for the interval
                        await new Promise((resolve) => {
                            setTimeout(() => resolve(undefined), interval);
                        });
                        // Log the retry
                        logger("retrying...");
                    }
                }
            }
        } catch (error_) {
            // Log the error
            error(
                `An error occured while waiting to reach elastic search on ${eshost}:${esport}`,
                error_,
            );
            await new Promise((resolve) => {
                setTimeout(() => resolve(undefined), interval);
            });
            logger("retrying...");
        }
    }
}
//# sourceMappingURL=elasticsearch.js.map
