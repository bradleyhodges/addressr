import { Client } from "@opensearch-project/opensearch";
/**
 * Configuration values for the Elasticsearch server
 */
export declare const ELASTIC_PORT: number;
/**
 * Whether to enable verbose logging.
 *
 * @default false
 * @env VERBOSE
 */
export declare const VERBOSE: boolean;
declare global {
    var esClient: Client;
}
/**
 * Drops the configured OpenSearch index if it exists.
 *
 * @param {Client} esClient - Connected OpenSearch client.
 * @returns {Promise<void>} Resolves after the index is removed or confirmed absent.
 */
export declare function dropIndex(esClient: Client): Promise<void>;
/**
 * The synonyms list.
 */
type SynonymsList = string[] | undefined;
/**
 * Ensures the address index exists and is configured with analyzers and mappings.
 *
 * @param {Client} esClient - Connected OpenSearch client.
 * @param {boolean} [clear] - When true, drop the index before recreating.
 * @param {SynonymsList} [synonyms] - Optional synonyms list to seed the analyzer.
 * @returns {Promise<void>} Resolves once the index is ready.
 */
export declare function initIndex(esClient: Client, clear?: boolean, synonyms?: SynonymsList): Promise<void>;
/**
 * Drops the configured OpenSearch locality index if it exists.
 *
 * @param esClient - Connected OpenSearch client.
 * @returns Resolves after the index is removed or confirmed absent.
 */
export declare function dropLocalityIndex(esClient: Client): Promise<void>;
/**
 * Ensures the locality index exists and is configured with analyzers and mappings.
 *
 * @param esClient - Connected OpenSearch client.
 * @param clear - When true, drop the index before recreating.
 * @returns Resolves once the index is ready.
 */
export declare function initLocalityIndex(esClient: Client, clear?: boolean): Promise<void>;
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
export declare function esConnect(esport?: number, eshost?: string, interval?: number, timeout?: number): Promise<Client>;
export {};
//# sourceMappingURL=elasticsearch.d.ts.map