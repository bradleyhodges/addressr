"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRest2Server = startRest2Server;
exports.stopServer = stopServer;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const path = __importStar(require("node:path"));
const waycharter_1 = require("@mountainpass/waycharter");
const version_1 = require("@repo/addresskit-core/version");
const debug_1 = __importDefault(require("debug"));
const express_1 = __importDefault(require("express"));
const js_yaml_1 = require("js-yaml");
const swaggerUi = __importStar(require("swagger-ui-express"));
const service_1 = require("../service");
const config_1 = require("../service/config");
const app = (0, express_1.default)();
const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const serverPort = Number(process.env.PORT ?? 8080);
const logger = (0, debug_1.default)("api");
const error = (0, debug_1.default)("error");
// Ensure error-level logs surface even when debug namespaces are filtered.
error.log = console.error.bind(console);
let server;
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
function appendCorsHeaders(_request, response, next) {
    // If the ACCESS_CONTROL_ALLOW_ORIGIN environment variable is set, add the Access-Control-Allow-Origin header
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
        response.append("Access-Control-Allow-Origin", process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN);
    }
    // If the ACCESS_CONTROL_EXPOSE_HEADERS environment variable is set, add the Access-Control-Expose-Headers header
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
        response.append("Access-Control-Expose-Headers", process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS);
    }
    // If the ACCESS_CONTROL_ALLOW_HEADERS environment variable is set, add the Access-Control-Allow-Headers header
    if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
        response.append("Access-Control-Allow-Headers", process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS);
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
function mapSearchHitToResource(hit, maxScore) {
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
async function loadAddressItem({ pid }) {
    // Fail fast when a PID is missing to avoid an opaque 500 from downstream services.
    if (typeof pid !== "string" || pid.length === 0) {
        throw new Error("Address PID is required to load a record.");
    }
    // Get the address from the Elasticsearch index.
    const { json, hash, statusCode } = (await (0, service_1.getAddress)(pid));
    // Return the address body, headers, and status code.
    return {
        body: json,
        headers: {
            etag: `"${version_1.version}-${hash}"`,
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
async function loadAddressCollection(params) {
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
        const searchResult = (await (0, service_1.searchForAddress)(q, resolvedPage + 1, pageSize));
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
        const jsonApiDocument = {
            jsonapi: { version: "1.1" },
            data,
            links: {
                self: `${baseUrl}${currentPage > 1 ? `&page[number]=${currentPage}` : ""}`,
                first: baseUrl,
                ...(currentPage > 1 && {
                    prev: currentPage === 2
                        ? baseUrl
                        : `${baseUrl}&page[number]=${currentPage - 1}`,
                }),
                ...(currentPage < totalPages && {
                    next: `${baseUrl}&page[number]=${currentPage + 1}`,
                }),
                ...(totalPages > 0 && {
                    last: totalPages === 1
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
        const responseHash = (0, node_crypto_1.createHash)("md5")
            .update(JSON.stringify(jsonApiDocument))
            .digest("hex");
        // Return the JSON:API document, hasMore, and headers.
        return {
            body: jsonApiDocument,
            hasMore: currentPage < totalPages,
            headers: {
                etag: `"${version_1.version}-${responseHash}"`,
                "cache-control": `public, max-age=${ONE_WEEK}`,
            },
        };
    }
    // Empty query responses still carry cache headers for intermediary caches.
    const emptyDocument = {
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
            etag: `"${version_1.version}"`,
            "cache-control": `public, max-age=${ONE_WEEK}`,
        },
    };
}
/**
 * Maps a raw locality search hit into a JSON:API autocomplete resource.
 *
 * @param {LocalitySearchHit} hit - Search hit returned by the backing index.
 * @param {number} maxScore - The maximum score for normalization.
 * @returns {LocalitySuggestionResource} JSON:API resource for autocomplete.
 */
function mapLocalitySearchHitToResource(hit, maxScore) {
    const localityId = hit._id.replace("/localities/", "");
    // Normalize score to 0-1 range relative to the best match
    const normalizedRank = maxScore > 0 ? hit._score / maxScore : 0;
    return {
        type: "locality-suggestion",
        id: localityId,
        attributes: {
            display: hit._source.display,
            rank: Math.round(normalizedRank * 100) / 100,
        },
        links: {
            self: `/localities/${localityId}`,
        },
    };
}
/**
 * Loads a single locality resource by its persistent identifier.
 *
 * @param {LocalityLoaderParams} params - Parameters supplied by WayCharter containing the locality PID.
 * @returns {Promise<{ body: unknown; headers: Record<string, string>; status: number; }>} Payload ready for WayCharter response handling.
 * @throws {Error} When a locality PID is not provided.
 */
async function loadLocalityItem({ localityPid, }) {
    // Fail fast when a locality PID is missing to avoid an opaque 500 from downstream services.
    if (typeof localityPid !== "string" || localityPid.length === 0) {
        throw new Error("Locality PID is required to load a record.");
    }
    // Get the locality from the Elasticsearch index.
    const { json, hash, statusCode } = (await (0, service_1.getLocality)(localityPid));
    // Return the locality body, headers, and status code.
    return {
        body: json,
        headers: {
            etag: `"${version_1.version}-${hash}"`,
            "cache-control": `public, max-age=${ONE_WEEK}`,
        },
        status: statusCode ?? 200,
    };
}
/**
 * Retrieves a paginated collection of localities matching the supplied query.
 * Returns a JSON:API formatted document.
 *
 * @param {LocalityCollectionParams} params - Pagination and query parameters from WayCharter.
 * @returns {Promise<{ body: LocalityAutocompleteDocument; hasMore: boolean; headers: Record<string, string>; }>} JSON:API collection response.
 * @throws {Error} When the provided page value cannot be parsed as a number.
 */
async function loadLocalityCollection(params) {
    const { page, q } = params;
    // Accept numeric strings from query params while rejecting non-numeric input.
    const resolvedPage = Number(page ?? 0);
    if (!Number.isFinite(resolvedPage)) {
        throw new Error("Search page value must be numeric.");
    }
    // Build base URL for pagination links
    const baseUrl = `/localities${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    // If the query is defined and longer than 1 character, search for localities.
    if (q && q.length > 1) {
        logger("Searching for localities with query:", q);
        // Query length guard prevents expensive searches on very short strings.
        const searchResult = (await (0, service_1.searchForLocality)(q, resolvedPage + 1, pageSize));
        // Extract hits from the nested searchResponse structure
        const hits = searchResult.searchResponse.body.hits.hits;
        const totalHits = searchResult.totalHits;
        const totalPages = Math.ceil(totalHits / pageSize);
        const currentPage = resolvedPage + 1;
        // Get max score for normalization (first hit typically has highest score)
        const maxScore = hits.length > 0 ? hits[0]._score : 1;
        // Map the search hits to JSON:API resources
        const data = hits.map((hit) => mapLocalitySearchHitToResource(hit, maxScore));
        // Build JSON:API document
        const jsonApiDocument = {
            jsonapi: { version: "1.1" },
            data,
            links: {
                self: `${baseUrl}${currentPage > 1 ? `&page[number]=${currentPage}` : ""}`,
                first: baseUrl,
                ...(currentPage > 1 && {
                    prev: currentPage === 2
                        ? baseUrl
                        : `${baseUrl}&page[number]=${currentPage - 1}`,
                }),
                ...(currentPage < totalPages && {
                    next: `${baseUrl}&page[number]=${currentPage + 1}`,
                }),
                ...(totalPages > 0 && {
                    last: totalPages === 1
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
        const responseHash = (0, node_crypto_1.createHash)("md5")
            .update(JSON.stringify(jsonApiDocument))
            .digest("hex");
        // Return the JSON:API document, hasMore, and headers.
        return {
            body: jsonApiDocument,
            hasMore: currentPage < totalPages,
            headers: {
                etag: `"${version_1.version}-${responseHash}"`,
                "cache-control": `public, max-age=${ONE_WEEK}`,
            },
        };
    }
    // Empty query responses still carry cache headers for intermediary caches.
    const emptyDocument = {
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
            etag: `"${version_1.version}"`,
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
function transformPaginationParams(req, _res, next) {
    // Handle JSON:API style pagination: page[number]=2 -> page=1 (0-indexed)
    // biome-ignore lint/suspicious/noExplicitAny: Express query params are untyped
    const pageParam = req.query.page;
    if (pageParam && typeof pageParam === "object" && pageParam.number) {
        // Convert from 1-indexed JSON:API to 0-indexed WayCharter
        const pageNumber = Number(pageParam.number);
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
            req.query.page = String(pageNumber - 1);
        }
    }
    else if (typeof pageParam === "string") {
        // If page is already a string number, convert from 1-indexed to 0-indexed
        const pageNumber = Number(pageParam);
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
            req.query.page = String(pageNumber - 1);
        }
    }
    next();
}
async function startRest2Server() {
    // Use the CORS middleware
    app.use(appendCorsHeaders);
    // Transform JSON:API pagination params before WayCharter processes them
    app.use(transformPaginationParams);
    // Load and serve OpenAPI/Swagger documentation at /docs
    const swaggerSpecPath = path.join(__dirname, "../api/swagger.yaml");
    const swaggerSpec = (0, js_yaml_1.load)((0, node_fs_1.readFileSync)(swaggerSpecPath, "utf8"));
    // Cast through unknown to resolve express type version conflicts
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    // Serve the raw OpenAPI spec as JSON at /api-docs
    app.get("/api-docs", (_req, res) => {
        res.json(swaggerSpec);
    });
    // WayCharter provides hypermedia routing; attach its router before custom handlers.
    // Create a new WayCharter instance
    const waycharter = new waycharter_1.WayCharter();
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
    // Register the localities collection.
    const localitiesType = waycharter.registerCollection({
        itemPath: "/:localityPid",
        itemLoader: loadLocalityItem,
        collectionPath: "/localities",
        collectionLoader: loadLocalityCollection,
        filters: [
            {
                rel: "https://addressr.io/rels/locality-search",
                parameters: ["q"],
            },
        ],
    });
    /**
     * Builds the API index resource, exposing links to available collections.
     *
     * @returns {Promise<{ body: Record<string, never>; links: unknown; headers: Record<string, string>; }>} Index payload with cache headers.
     */
    const loadIndexResource = async () => {
        // Combine links from both collections
        const addressLinks = addressesType.additionalPaths;
        const localityLinks = localitiesType.additionalPaths;
        return {
            body: {},
            links: [...addressLinks, ...localityLinks],
            headers: {
                etag: `"${version_1.version}"`,
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
    server = (0, node_http_1.createServer)(app);
    /**
     * Logs server start-up details once the HTTP server begins listening.
     *
     * @returns {void} Nothing; side-effects are logging only.
     */
    const logStartup = () => {
        if (config_1.VERBOSE)
            logger("📡  AddressKit is listening on port %d ( http://localhost:%d ) ", serverPort, serverPort);
    };
    /**
     * Starts listening on the configured port and resolves once ready.
     *
     * @param {() => void} resolve - Promise resolver invoked after server starts.
     * @returns {void} Nothing; side-effects start the server.
     */
    const startListening = (resolve) => {
        /**
         * Handles the listening event by logging and resolving the start Promise.
         *
         * @returns {void} Nothing; side-effects only.
         */
        const handleServerListening = () => {
            logStartup();
            resolve();
        };
        // Listen on the server port
        server?.listen(serverPort, handleServerListening);
    };
    // Start listening on the server port
    await new Promise(startListening);
    // Return the server URL
    return `http://localhost:${serverPort}`;
}
/**
 * Stops the HTTP server if it has been started.
 *
 * @returns {void} Nothing is returned; server state is updated in place.
 */
function stopServer() {
    if (server !== undefined) {
        server.close();
    }
}
//# sourceMappingURL=waycharterServer.js.map