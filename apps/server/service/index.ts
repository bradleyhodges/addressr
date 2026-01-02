import * as fs from "node:fs";
import * as path from "node:path";
import { Agent as HttpsAgent } from "node:https";
import * as stream from "node:stream";
import { initIndex } from "@repo/addressr-client/elasticsearch";
import download from "@repo/addressr-core/utils/stream-down";
import debug from "debug";
import * as directoryExists from "directory-exists";
import * as glob from "glob-promise";
import * as got from "got";
import * as Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import * as Papa from "papaparse";
import * as unzip from "unzip-stream";
import { clearAddresses, mapAddressDetails, buildSynonyms } from "./helpers";
import type * as Types from "./types/index";
import {
    getFiles,
    countLinesInFile,
    fileExists,
    loadFileCounts,
} from "./helpers/fs";
import {
    PAGE_SIZE,
    COVERED_STATES,
    ONE_DAY_MS,
    THIRTY_DAYS_MS,
    ES_INDEX_NAME,
    GNAF_PACKAGE_URL,
    GNAF_DIR,
} from "./conf";
import { loadCommandEntry, sendIndexRequest } from "./commands/load";

/**
 * Make the file system promises available globally.
 */
export const fsp = fs.promises;
export const { readdir } = fsp;

/**
 * Loggers for the API.
 */
export const logger = debug("api");
export const error = debug("error");

/**
 * The cache for the API.
 */
export const cache = new Keyv({
    store: new KeyvFile({ filename: "target/keyv-file.msgpack" }),
});

/**
 * Persistent HTTP cache for Got requests to avoid re-downloading unchanged payloads.
 */
export const gnafHttpCache = new Keyv({
    store: new KeyvFile({ filename: "target/gnaf-http-cache.msgpack" }),
    namespace: "gnaf-http-cache",
});

/**
 * Shared keep-alive HTTPS agent to reuse sockets across fetches.
 */
export const keepAliveAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 10,
});

/**
 * Got client configured for persistent HTTP cache reuse and keep-alive sockets.
 */
export const gotClient = got.extend({
    cache: gnafHttpCache,
    agent: { http: keepAliveAgent, https: keepAliveAgent },
});

// ---------------------------------------------------------------------------------

/**
 * Sets the addresses in the index.
 *
 * @param addr - The addresses to set.
 */
const setAddresses = async (addr: Types.IndexableAddress[]) => {
    // Clear the addresses index
    await clearAddresses();

    // Create the indexing body
    const indexingBody: Types.BulkIndexBody = [];

    // Loop through the addresses
    for (const row of addr) {
        // Add the index operation to the body
        indexingBody.push({
            index: {
                _index: ES_INDEX_NAME,
                _id: row.links.self.href,
            },
        });

        // Add the address details to the body
        const { sla, ssla, ...structurted } = row;
        const confidence =
            structurted.structurted?.confidence ?? structurted.confidence;

        // Add the address details to the body
        indexingBody.push({
            sla,
            ssla,
            structurted,
            ...(confidence !== undefined && { confidence }),
        });
    }

    // If there are addresses to index, send the index request
    if (indexingBody.length > 0) {
        // Send the index request
        await sendIndexRequest(indexingBody);
    }
};

/**
 * Searches for an address in the index.
 *
 * @augments autoCompleteAddress - This function is part of the autocomplete (searching) functionality of the service
 *
 * @param searchString - The search string.
 * @param p - The page number.
 * @param pageSize - The page size.
 * @returns {Promise<Types.OpensearchApiResponse<Types.OpensearchSearchResponse<unknown>, unknown>>} - A promise that resolves when the address is searched for.
 */
const searchForAddress = async (
    searchString: string,
    p: number,
    pageSize: number = PAGE_SIZE,
): Promise<
    Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >
> => {
    // Search the index for the address
    const searchResp = (await (
        global.esClient as Types.OpensearchClient
    ).search({
        index: ES_INDEX_NAME,
        body: {
            from: (p - 1 || 0) * pageSize,
            size: pageSize,
            query: {
                bool: {
                    // If the search string is not empty, add the search string to the query using a multi match query to
                    // search against the `sla` and `ssla` fields
                    ...(searchString && {
                        should: [
                            {
                                multi_match: {
                                    fields: ["sla", "ssla"],
                                    query: searchString,
                                    // Fuzziness is set to AUTO to allow for typos and variations in the search string
                                    fuzziness: "AUTO",
                                    // Type is set to bool_prefix to allow for partial matching of the search string
                                    type: "bool_prefix",
                                    // Lenient is set to true to allow for partial matching of the search string
                                    lenient: true,
                                    // Auto generate synonyms phrase query is set to false to prevent the generation of synonyms phrase queries
                                    auto_generate_synonyms_phrase_query: false,
                                    operator: "AND",
                                },
                            },
                            {
                                multi_match: {
                                    fields: ["sla", "ssla"],
                                    query: searchString,
                                    // Type is set to phrase_prefix to allow for partial matching of the search string
                                    type: "phrase_prefix",
                                    // Lenient is set to true to allow for partial matching of the search string
                                    lenient: true,
                                    // Auto generate synonyms phrase query is set to false to prevent the generation of synonyms phrase queries
                                    auto_generate_synonyms_phrase_query: false,
                                    operator: "AND",
                                },
                            },
                        ],
                    }),
                },
            },
            sort: [
                "_score",
                { confidence: { order: "desc" } },
                { "ssla.raw": { order: "asc" } },
                { "sla.raw": { order: "asc" } },
            ],
            highlight: {
                fields: {
                    sla: {},
                    ssla: {},
                },
            },
        },
    })) as Types.OpensearchApiResponse<
        Types.OpensearchSearchResponse<unknown>,
        unknown
    >;

    // Log the hits
    logger("hits", JSON.stringify(searchResp.body.hits, undefined, 2));
    return searchResp;
};

/**
 * The default export for the service. These are the commands that can be used to interact with the service.
 */
export default {
    load: loadCommandEntry,
    autocomplete: async (searchString: string) => {},
};
