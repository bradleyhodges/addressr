import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import * as path from "node:path";
import { WayCharter } from "@mountainpass/waycharter";
import { version } from "@repo/addresskit-core/version";
import debug from "debug";
import * as express from "express";
import type { NextFunction, Request, Response } from "express";
import { load as loadYaml } from "js-yaml";
import * as swaggerUi from "swagger-ui-express";
import { getAddress, searchForAddress } from "../service";
import { VERBOSE } from "../service/config";

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
    highlight?: {
        sla?: string[];
        ssla?: string[];
    };
};

/**
 * The search result returned by searchForAddress.
 */
type SearchForAddressResult = {
    searchResponse: {
        body: {
            hits: {
                hits: AddressSearchHit[];
                total: {
                    value: number;
                };
            };
        };
    };
    page: number;
    size: number;
    totalHits: number;
};

/**
 * JSON:API resource for an autocomplete suggestion.
 */
type AddressSuggestionResource = {
    type: "address-suggestion";
    id: string;
    attributes: {
        sla: string;
        ssla?: string;
        rank: number;
    };
    links: {
        self: string;
    };
};

/**
 * JSON:API document for autocomplete results.
 */
type AddressAutocompleteDocument = {
    jsonapi: { version: string };
    data: AddressSuggestionResource[];
    links: {
        self: string;
        first?: string;
        prev?: string | null;
        next?: string | null;
        last?: string;
    };
    meta: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
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
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
        response.append(
            "Access-Control-Allow-Origin",
            process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN,
        );
    }

    // If the ACCESS_CONTROL_EXPOSE_HEADERS environment variable is set, add the Access-Control-Expose-Headers header
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
        response.append(
            "Access-Control-Expose-Headers",
            process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS,
        );
    }

    // If the ACCESS_CONTROL_ALLOW_HEADERS environment variable is set, add the Access-Control-Allow-Headers header
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
        response.append(
            "Access-Control-Allow-Headers",
            process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS,
        );
    }

    // Call the next middleware
    next();
}

/**
 * Maps a raw search hit into a JSON:API autocomplete resource.
 *
 * @param {AddressSearchHit} hit - Search hit returned by the backing index.
 * @param {number} maxScore - The maximum score for normalization.
 * @returns {AddressSuggestionResource} JSON:API resource for autocomplete.
 */
function mapSearchHitToResource(
    hit: AddressSearchHit,
    maxScore: number,
): AddressSuggestionResource {
    const addressId = hit._id.replace("/addresses/", "");
    // Normalize score to 0-1 range relative to the best match
    const normalizedRank = maxScore > 0 ? hit._score / maxScore : 0;

    return {
        type: "address-suggestion",
        id: addressId,
        attributes: {
            sla: hit._source.sla,
            ...(hit._source.ssla && { ssla: hit._source.ssla }),
            rank: Math.round(normalizedRank * 100) / 100,
        },
        links: {
            self: `/addresses/${addressId}`,
        },
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
 * Returns a JSON:API formatted document.
 *
 * @param {AddressCollectionParams} params - Pagination and query parameters from WayCharter.
 * @returns {Promise<{ body: AddressAutocompleteDocument; hasMore: boolean; headers: Record<string, string>; }>} JSON:API collection response.
 * @throws {Error} When the provided page value cannot be parsed as a number.
 */
async function loadAddressCollection(params: AddressCollectionParams): Promise<{
    body: AddressAutocompleteDocument;
    hasMore: boolean;
    headers: Record<string, string>;
}> {
    const { page, q } = params;

    // Accept numeric strings from query params while rejecting non-numeric input.
    const resolvedPage = Number(page ?? 0);
    if (!Number.isFinite(resolvedPage)) {
        throw new Error("Search page value must be numeric.");
    }

    // Build base URL for pagination links
    const baseUrl = `/addresses${q ? `?q=${encodeURIComponent(q)}` : ""}`;

    // If the query is defined and longer than 2 characters, search for addresses.
    if (q && q.length > 2) {
        logger("Searching for addresses with query:", q);
        // Query length guard prevents expensive searches on very short strings.
        const searchResult = (await searchForAddress(
            q,
            resolvedPage + 1,
            pageSize,
        )) as unknown as SearchForAddressResult;

        // Extract hits from the nested searchResponse structure
        const hits = searchResult.searchResponse.body.hits.hits;
        const totalHits = searchResult.totalHits;
        const totalPages = Math.ceil(totalHits / pageSize);
        const currentPage = resolvedPage + 1;

        // Get max score for normalization (first hit typically has highest score)
        const maxScore = hits.length > 0 ? hits[0]._score : 1;

        // Map the search hits to JSON:API resources
        const data = hits.map((hit) => mapSearchHitToResource(hit, maxScore));

        // Build JSON:API document
        const jsonApiDocument: AddressAutocompleteDocument = {
            jsonapi: { version: "1.1" },
            data,
            links: {
                self: `${baseUrl}${currentPage > 1 ? `&page[number]=${currentPage}` : ""}`,
                first: baseUrl,
                ...(currentPage > 1 && {
                    prev:
                        currentPage === 2
                            ? baseUrl
                            : `${baseUrl}&page[number]=${currentPage - 1}`,
                }),
                ...(currentPage < totalPages && {
                    next: `${baseUrl}&page[number]=${currentPage + 1}`,
                }),
                ...(totalPages > 0 && {
                    last:
                        totalPages === 1
                            ? baseUrl
                            : `${baseUrl}&page[number]=${totalPages}`,
                }),
            },
            meta: {
                total: totalHits,
                page: currentPage,
                pageSize,
                totalPages,
            },
        };

        // Create a hash of the body to use as the ETag.
        const responseHash = createHash("md5")
            .update(JSON.stringify(jsonApiDocument))
            .digest("hex");

        // Return the JSON:API document, hasMore, and headers.
        return {
            body: jsonApiDocument,
            hasMore: currentPage < totalPages,
            headers: {
                etag: `"${version}-${responseHash}"`,
                "cache-control": `public, max-age=${ONE_WEEK}`,
            },
        };
    }

    // Empty query responses still carry cache headers for intermediary caches.
    const emptyDocument: AddressAutocompleteDocument = {
        jsonapi: { version: "1.1" },
        data: [],
        links: {
            self: baseUrl,
        },
        meta: {
            total: 0,
            page: 1,
            pageSize,
            totalPages: 0,
        },
    };

    return {
        body: emptyDocument,
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
/**
 * Middleware to transform JSON:API pagination parameters to WayCharter format.
 * Converts `page[number]=2` to `page=1` (0-indexed for WayCharter).
 *
 * @param {Request} req - The incoming Express request.
 * @param {Response} _res - The Express response (unused).
 * @param {NextFunction} next - Invokes the next middleware.
 */
function transformPaginationParams(
    req: Request,
    _res: Response,
    next: NextFunction,
): void {
    // Handle JSON:API style pagination: page[number]=2 -> page=1 (0-indexed)
    // biome-ignore lint/suspicious/noExplicitAny: Express query params are untyped
    const pageParam = req.query.page as any;
    if (pageParam && typeof pageParam === "object" && pageParam.number) {
        // Convert from 1-indexed JSON:API to 0-indexed WayCharter
        const pageNumber = Number(pageParam.number);
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
            req.query.page = String(pageNumber - 1);
        }
    } else if (typeof pageParam === "string") {
        // If page is already a string number, convert from 1-indexed to 0-indexed
        const pageNumber = Number(pageParam);
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
            req.query.page = String(pageNumber - 1);
        }
    }
    next();
}

export async function startRest2Server(): Promise<string> {
    // Use the CORS middleware
    app.use(appendCorsHeaders);

    // Transform JSON:API pagination params before WayCharter processes them
    app.use(transformPaginationParams);

    // Load and serve OpenAPI/Swagger documentation at /docs
    const swaggerSpecPath = path.join(__dirname, "../api/swagger.yaml");
    const swaggerSpec = loadYaml(
        readFileSync(swaggerSpecPath, "utf8"),
    ) as swaggerUi.JsonObject;
    // Cast through unknown to resolve express type version conflicts
    app.use(
        "/docs",
        swaggerUi.serve as unknown as express.RequestHandler[],
        swaggerUi.setup(swaggerSpec) as unknown as express.RequestHandler,
    );

    // Serve the raw OpenAPI spec as JSON at /api-docs
    app.get("/api-docs", (_req: Request, res: Response) => {
        res.json(swaggerSpec);
    });

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
        if (VERBOSE)
            logger(
                "📡  AddressKit is listening on port %d ( http://localhost:%d ) ",
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
