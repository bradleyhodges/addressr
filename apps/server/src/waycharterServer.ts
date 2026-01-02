import { createHash } from "node:crypto";
import { type Server, createServer } from "node:http";
import { WayCharter } from "@mountainpass/waycharter";
import { version } from "@repo/addressr-core/version";
import debug from "debug";
import * as express from "express";
import type { NextFunction, Request, Response } from "express";
import { getAddress, searchForAddress } from "../service";

/**
 * The result of a get address request.
 */
type GetAddressResult = {
    json: unknown;
    hash: string;
    statusCode?: number;
};

/**
 * The address search hit.
 */
type AddressSearchHit = {
    _id: string;
    _score: number;
    _source: {
        sla: string;
        ssla?: string;
    };
    highlight: {
        sla: string[];
        ssla?: string[];
    };
};

/**
 * The address search response.
 */
type AddressSearchResponse = {
    body: {
        hits: {
            hits: AddressSearchHit[];
            total: {
                value: number;
            };
        };
    };
};

/**
 * The address collection body.
 */
type AddressCollectionBody = {
    sla: string;
    ssla?: string;
    highlight: {
        sla: string;
        ssla?: string;
    };
    score: number;
    pid: string;
};

/**
 * The address loader parameters.
 */
type AddressLoaderParams = Record<string, string | number | undefined> & {
    pid?: string;
};

/**
 * The address collection parameters.
 */
type AddressCollectionParams = Record<string, string | number | undefined> & {
    page?: number | string;
    q?: string;
};

const app = express();

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;

const serverPort = Number(process.env.PORT ?? 8080);
const logger = debug("api");
const error = debug("error");

// Ensure error-level logs surface even when debug namespaces are filtered.
error.log = console.error.bind(console);

let server: Server | undefined;

// PAGE_SIZE is set once at boot so pagination remains stable for the process lifetime.
const pageSize = Number(process.env.PAGE_SIZE ?? 8);

/**
 * Appends configured CORS headers so the API can be consumed by trusted origins.
 *
 * @param {Request} _request - The incoming Express request (unused, present for middleware shape).
 * @param {Response} response - The Express response used to append headers.
 * @param {NextFunction} next - Invokes the next middleware in the chain.
 * @returns {void} Nothing is returned; middleware continues via `next`.
 */
function appendCorsHeaders(
    _request: Request,
    response: Response,
    next: NextFunction,
): void {
    // If the ACCESS_CONTROL_ALLOW_ORIGIN environment variable is set, add the Access-Control-Allow-Origin header
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
        response.append(
            "Access-Control-Allow-Origin",
            process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN,
        );
    }

    // If the ACCESS_CONTROL_EXPOSE_HEADERS environment variable is set, add the Access-Control-Expose-Headers header
    if (process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
        response.append(
            "Access-Control-Expose-Headers",
            process.env.ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS,
        );
    }

    // If the ACCESS_CONTROL_ALLOW_HEADERS environment variable is set, add the Access-Control-Allow-Headers header
    if (process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
        response.append(
            "Access-Control-Allow-Headers",
            process.env.ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS,
        );
    }

    // Call the next middleware
    next();
}

/**
 * Maps a raw search hit into the API's public address structure.
 *
 * @param {AddressSearchHit} hit - Search hit returned by the backing index.
 * @returns {AddressCollectionBody} Normalized address payload for clients.
 */
function mapSearchHitToAddress(hit: AddressSearchHit): AddressCollectionBody {
    // Use the first highlight snippet for each field to keep payloads small
    return {
        sla: hit._source.sla,
        ...(hit._source.ssla && { ssla: hit._source.ssla }),
        highlight: {
            sla: hit.highlight.sla[0],
            ...(hit.highlight.ssla && { ssla: hit.highlight.ssla[0] }),
        },
        score: hit._score,
        pid: hit._id.replace("/addresses/", ""),
    };
}

/**
 * Loads a single address resource by its persistent identifier.
 *
 * @param {AddressLoaderParams} params - Parameters supplied by WayCharter containing the PID.
 * @returns {Promise<{ body: unknown; headers: Record<string, string>; status: number; }>} Payload ready for WayCharter response handling.
 * @throws {Error} When a PID is not provided.
 */
async function loadAddressItem({ pid }: AddressLoaderParams): Promise<{
    body: unknown;
    headers: Record<string, string>;
    status: number;
}> {
    // Fail fast when a PID is missing to avoid an opaque 500 from downstream services.
    if (typeof pid !== "string" || pid.length === 0) {
        throw new Error("Address PID is required to load a record.");
    }

    // Get the address from the Elasticsearch index.
    const { json, hash, statusCode } = (await getAddress(
        pid,
    )) as GetAddressResult;

    // Return the address body, headers, and status code.
    return {
        body: json,
        headers: {
            etag: `"${version}-${hash}"`,
            "cache-control": `public, max-age=${ONE_WEEK}`,
        },
        status: statusCode ?? 200,
    };
}

/**
 * Retrieves a paginated collection of addresses matching the supplied query.
 *
 * @param {AddressCollectionParams} params - Pagination and query parameters from WayCharter.
 * @returns {Promise<{ body: AddressCollectionBody[]; hasMore: boolean; headers: Record<string, string>; }>} Collection response with cache headers.
 * @throws {Error} When the provided page value cannot be parsed as a number.
 */
async function loadAddressCollection({
    page,
    q,
}: AddressCollectionParams): Promise<{
    body: AddressCollectionBody[];
    hasMore: boolean;
    headers: Record<string, string>;
}> {
    // Accept numeric strings from query params while rejecting non-numeric input.
    const resolvedPage = Number(page ?? 0);
    if (!Number.isFinite(resolvedPage)) {
        throw new Error("Search page value must be numeric.");
    }

    // If the query is defined and longer than 2 characters, search for addresses.
    if (q && q.length > 2) {
        // Query length guard prevents expensive searches on very short strings.
        const foundAddresses = (await searchForAddress(
            q,
            resolvedPage + 1,
            pageSize,
        )) as unknown as AddressSearchResponse;

        // Map the search hits to the address collection body.
        const body = foundAddresses.body.hits.hits.map(mapSearchHitToAddress);

        // Create a hash of the body to use as the ETag.
        const responseHash = createHash("md5")
            .update(JSON.stringify(body))
            .digest("hex");

        // Return the address collection body, hasMore, and headers.
        return {
            body,
            hasMore:
                resolvedPage <
                foundAddresses.body.hits.total.value / pageSize - 1,
            headers: {
                etag: `"${version}-${responseHash}"`,
                "cache-control": `public, max-age=${ONE_WEEK}`,
            },
        };
    }

    // Empty query responses still carry cache headers for intermediary caches.
    return {
        body: [],
        hasMore: false,
        headers: {
            etag: `"${version}"`,
            "cache-control": `public, max-age=${ONE_WEEK}`,
        },
    };
}

/**
 * Starts the REST server and registers hypermedia resources.
 *
 * @returns {Promise<string>} The base URL where the server is listening.
 * @throws {Error} When server creation or listener binding fails.
 */
export async function startRest2Server(): Promise<string> {
    // Use the CORS middleware
    app.use(appendCorsHeaders);

    // WayCharter provides hypermedia routing; attach its router before custom handlers.
    // Create a new WayCharter instance
    const waycharter = new WayCharter();
    app.use(waycharter.router);

    // Register the addresses collection.
    const addressesType = waycharter.registerCollection({
        itemPath: "/:pid",
        itemLoader: loadAddressItem,
        collectionPath: "/addresses",
        collectionLoader: loadAddressCollection,
        filters: [
            {
                rel: "https://addressr.io/rels/address-search",
                parameters: ["q"],
            },
        ],
    });

    /**
     * Builds the API index resource, exposing links to available collections.
     *
     * @returns {Promise<{ body: Record<string, never>; links: unknown; headers: Record<string, string>; }>} Index payload with cache headers.
     */
    const loadIndexResource = async (): Promise<{
        body: Record<string, never>;
        links: unknown;
        headers: Record<string, string>;
    }> => {
        return {
            body: {},
            links: addressesType.additionalPaths,
            headers: {
                etag: `"${version}"`,
                "cache-control": `public, max-age=${ONE_WEEK}`,
            },
        };
    };

    // Register the index resource.
    waycharter.registerResourceType({
        path: "/",
        loader: loadIndexResource,
    });

    // Create the server
    server = createServer(app);

    /**
     * Logs server start-up details once the HTTP server begins listening.
     *
     * @returns {void} Nothing; side-effects are logging only.
     */
    const logStartup = (): void => {
        logger(
            "📡  Addressr is listening on port %d ( http://localhost:%d ) ",
            serverPort,
            serverPort,
        );
    };

    /**
     * Starts listening on the configured port and resolves once ready.
     *
     * @param {() => void} resolve - Promise resolver invoked after server starts.
     * @returns {void} Nothing; side-effects start the server.
     */
    const startListening = (resolve: () => void): void => {
        /**
         * Handles the listening event by logging and resolving the start Promise.
         *
         * @returns {void} Nothing; side-effects only.
         */
        const handleServerListening = (): void => {
            logStartup();
            resolve();
        };

        // Listen on the server port
        server?.listen(serverPort, handleServerListening);
    };

    // Start listening on the server port
    await new Promise<void>(startListening);

    // Return the server URL
    return `http://localhost:${serverPort}`;
}

/**
 * Stops the HTTP server if it has been started.
 *
 * @returns {void} Nothing is returned; server state is updated in place.
 */
export function stopServer(): void {
    if (server !== undefined) {
        server.close();
    }
}
