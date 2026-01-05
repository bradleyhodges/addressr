/**
 * AddressKit G-NAF Mirror Serve Worker
 *
 * This Cloudflare Worker serves the G-NAF mirror content from DigitalOcean Spaces,
 * providing a fast and reliable CDN for AddressKit users.
 *
 * Features:
 * - Serves package_show.conf.json with caching
 * - Redirects to S3-compatible storage for large files (efficient)
 * - Provides convenience URLs for latest G-NAF downloads
 * - CORS support for browser-based clients
 * - Health check endpoint for monitoring
 * - Comprehensive logging and error handling
 *
 * @module gnaf-serve
 */

interface Env {
    DO_SPACES_ENDPOINT: string;
    DO_SPACES_BUCKET: string;
    CACHE_TTL_CONFIG: string;
    CACHE_TTL_FILES: string;
}

interface MirrorConfig {
    version: string;
    synced_at: string;
    source_modified: string;
    source_url: string;
    mirror_base_url: string;
    original_package: {
        success: boolean;
        result: {
            resources: Array<{
                id: string;
                name: string;
                url: string;
                format: string;
                mimetype: string | null;
                size: number | null;
            }>;
            [key: string]: unknown;
        };
    };
    resources: Array<{
        id: string;
        name: string;
        original_url: string;
        mirror_url: string;
        mirror_path: string;
        format: string;
    }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates CORS headers for responses.
 */
function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
        "Access-Control-Expose-Headers":
            "Content-Length, Content-Range, ETag, Last-Modified",
        "Access-Control-Max-Age": "86400",
    };
}

/**
 * Creates a JSON response with proper headers.
 */
function jsonResponse(
    data: unknown,
    status = 200,
    headers: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
            ...headers,
        },
    });
}

/**
 * Creates an error response.
 */
function errorResponse(message: string, status = 500): Response {
    return jsonResponse({ error: message, status }, status);
}

/**
 * Formats bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructs the S3-compatible URL for a file in DigitalOcean Spaces.
 */
function getSpacesUrl(env: Env, path: string): string {
    // Remove leading slash if present
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `https://${env.DO_SPACES_BUCKET}.${env.DO_SPACES_ENDPOINT}/${cleanPath}`;
}

/**
 * Fetches the mirror configuration from storage.
 */
async function fetchMirrorConfig(env: Env): Promise<MirrorConfig | null> {
    const url = getSpacesUrl(env, "package_show.conf.json");

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "AddressKit-Mirror-Serve/1.0",
            },
        });

        if (!response.ok) {
            console.error(
                `Failed to fetch mirror config: ${response.status} ${response.statusText}`,
            );
            return null;
        }

        return (await response.json()) as MirrorConfig;
    } catch (error) {
        console.error("Error fetching mirror config:", error);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the root path - returns mirror status and info.
 */
async function handleRoot(env: Env): Promise<Response> {
    const config = await fetchMirrorConfig(env);

    if (!config) {
        return jsonResponse(
            {
                name: "AddressKit G-NAF Mirror",
                status: "unavailable",
                message:
                    "Mirror configuration not found. Sync may be in progress.",
                fallback_url:
                    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc",
            },
            503,
        );
    }

    const resources = config.resources.map((r) => ({
        name: r.name,
        format: r.format,
        url: r.mirror_url,
    }));

    return jsonResponse({
        name: "AddressKit G-NAF Mirror",
        status: "healthy",
        version: config.version,
        synced_at: config.synced_at,
        source_modified: config.source_modified,
        endpoints: {
            config: "/package_show.conf.json",
            gnaf_latest: "/gnaf-latest",
            gnaf_latest_gda2020: "/gnaf-latest-gda2020",
            health: "/health",
        },
        resources,
    });
}

/**
 * Handles the package_show.conf.json endpoint.
 */
async function handlePackageConfig(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = getSpacesUrl(env, "package_show.conf.json");
    const cacheTtl = Number.parseInt(env.CACHE_TTL_CONFIG, 10) || 3600;

    // Fetch from storage with caching
    const response = await fetch(url, {
        cf: {
            cacheTtl,
            cacheEverything: true,
        },
    });

    if (!response.ok) {
        return errorResponse("Mirror configuration not available", 503);
    }

    // Clone and add our headers
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
        newHeaders.set(key, value);
    }
    newHeaders.set("Cache-Control", `public, max-age=${cacheTtl}`);
    newHeaders.set("X-Mirror-Source", "addresskit");

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
    });
}

/**
 * Handles the /gnaf-latest endpoint - redirects to latest G-NAF ZIP (GDA94).
 */
async function handleGnafLatest(env: Env, gda2020 = false): Promise<Response> {
    const config = await fetchMirrorConfig(env);

    if (!config) {
        return errorResponse("Mirror not available", 503);
    }

    // Find the appropriate ZIP resource
    const searchTerm = gda2020 ? "gda2020" : "gda94";
    const resource = config.resources.find(
        (r) =>
            r.format.toLowerCase() === "zip" &&
            r.name.toLowerCase().includes(searchTerm),
    );

    if (!resource) {
        return errorResponse(
            `G-NAF ${gda2020 ? "GDA2020" : "GDA94"} ZIP not found`,
            404,
        );
    }

    // Redirect to the actual file
    return Response.redirect(resource.mirror_url, 302);
}

/**
 * Handles requests for files in the /gnaf/ path.
 */
async function handleGnafFile(
    request: Request,
    env: Env,
    path: string,
): Promise<Response> {
    const url = getSpacesUrl(env, path);
    const cacheTtl = Number.parseInt(env.CACHE_TTL_FILES, 10) || 86400;

    // For large files, redirect to the storage URL to avoid Worker limits
    // The storage has public-read ACL set during upload
    const headResponse = await fetch(url, { method: "HEAD" });

    if (!headResponse.ok) {
        return errorResponse("File not found", 404);
    }

    const contentLength = Number.parseInt(
        headResponse.headers.get("content-length") ?? "0",
        10,
    );

    // If file is larger than 100MB, redirect instead of proxying
    if (contentLength > 100 * 1024 * 1024) {
        // Add CORS headers to redirect response
        return new Response(null, {
            status: 302,
            headers: {
                Location: url,
                ...corsHeaders(),
                "Cache-Control": `public, max-age=${cacheTtl}`,
                "X-Content-Length": contentLength.toString(),
                "X-Content-Size-Human": formatBytes(contentLength),
            },
        });
    }

    // For smaller files, proxy through the Worker
    const response = await fetch(url, {
        cf: {
            cacheTtl,
            cacheEverything: true,
        },
    });

    if (!response.ok) {
        return errorResponse("File not found", 404);
    }

    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
        newHeaders.set(key, value);
    }
    newHeaders.set("Cache-Control", `public, max-age=${cacheTtl}`);

    return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
    });
}

/**
 * Handles the health check endpoint.
 */
async function handleHealth(env: Env): Promise<Response> {
    const config = await fetchMirrorConfig(env);

    const status = config ? "healthy" : "degraded";
    const httpStatus = config ? 200 : 503;

    return jsonResponse(
        {
            status,
            timestamp: new Date().toISOString(),
            mirror_synced_at: config?.synced_at ?? null,
            source_modified: config?.source_modified ?? null,
            resource_count: config?.resources.length ?? 0,
        },
        httpStatus,
        {
            "Cache-Control": "no-cache, no-store",
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(),
            });
        }

        // Only allow GET and HEAD methods
        if (request.method !== "GET" && request.method !== "HEAD") {
            return errorResponse("Method not allowed", 405);
        }

        try {
            // Route handling
            switch (true) {
                case path === "/" || path === "":
                    return handleRoot(env);

                case path === "/package_show.conf.json":
                    return handlePackageConfig(request, env);

                case path === "/gnaf-latest":
                    return handleGnafLatest(env, false);

                case path === "/gnaf-latest-gda2020":
                    return handleGnafLatest(env, true);

                case path === "/health":
                    return handleHealth(env);

                case path.startsWith("/gnaf/"):
                    return handleGnafFile(request, env, path);

                default:
                    return errorResponse("Not found", 404);
            }
        } catch (error) {
            console.error("Request handler error:", error);
            return errorResponse(
                `Internal server error: ${(error as Error).message}`,
                500,
            );
        }
    },
};
