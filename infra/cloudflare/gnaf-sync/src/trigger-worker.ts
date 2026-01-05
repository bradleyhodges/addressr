/**
 * G-NAF Sync Trigger Worker
 *
 * A lightweight Cloudflare Worker that:
 * 1. Checks if G-NAF has been updated on data.gov.au
 * 2. Compares with the current mirror version
 * 3. Triggers a GitHub Actions workflow if updates are available
 *
 * This allows using Cloudflare's cron triggers while delegating
 * the heavy lifting to GitHub Actions (which has no time limits).
 *
 * Environment Variables (secrets):
 * - GITHUB_TOKEN: Personal access token with workflow dispatch permission
 * - GITHUB_REPO: Repository in format "owner/repo"
 *
 * @module gnaf-sync-trigger
 */

interface Env {
    GITHUB_TOKEN: string;
    GITHUB_REPO: string;
    MIRROR_CONFIG_URL: string;
}

interface ScheduledEvent {
    cron: string;
    scheduledTime: number;
}

/**
 * Fetches the current G-NAF metadata from data.gov.au.
 */
async function fetchUpstreamMetadata(): Promise<{
    modified: string;
    resourceCount: number;
}> {
    const response = await fetch(
        "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc",
        {
            headers: { "User-Agent": "AddressKit-Sync-Trigger/1.0" },
        },
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch upstream: ${response.status}`);
    }

    const data = (await response.json()) as {
        result: {
            metadata_modified: string;
            resources: unknown[];
        };
    };

    return {
        modified: data.result.metadata_modified,
        resourceCount: data.result.resources.length,
    };
}

/**
 * Fetches the current mirror metadata.
 */
async function fetchMirrorMetadata(
    url: string,
): Promise<{ modified: string; syncedAt: string } | null> {
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "AddressKit-Sync-Trigger/1.0" },
        });

        if (!response.ok) {
            return null;
        }

        const data = (await response.json()) as {
            source_modified: string;
            synced_at: string;
        };

        return {
            modified: data.source_modified,
            syncedAt: data.synced_at,
        };
    } catch {
        return null;
    }
}

/**
 * Triggers a GitHub Actions workflow.
 */
async function triggerGitHubWorkflow(env: Env): Promise<boolean> {
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/gnaf-sync.yml/dispatches`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AddressKit-Sync-Trigger/1.0",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            ref: "main",
            inputs: {
                dry_run: "false",
                verbose: "false",
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Failed to trigger workflow: ${response.status} ${text}`);
        return false;
    }

    return true;
}

export default {
    /**
     * Handles scheduled (cron) events.
     */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<void> {
        console.log(
            `Cron triggered: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`,
        );

        try {
            // Fetch upstream metadata
            const upstream = await fetchUpstreamMetadata();
            console.log(`Upstream modified: ${upstream.modified}`);

            // Fetch mirror metadata
            const mirrorUrl =
                env.MIRROR_CONFIG_URL ||
                "https://dl.addresskit.com.au/package_show.conf.json";
            const mirror = await fetchMirrorMetadata(mirrorUrl);

            if (!mirror) {
                console.log("Mirror not found or empty - triggering sync");
                await triggerGitHubWorkflow(env);
                return;
            }

            console.log(
                `Mirror synced: ${mirror.syncedAt}, source: ${mirror.modified}`,
            );

            // Compare timestamps
            if (upstream.modified !== mirror.modified) {
                console.log("Update detected! Triggering GitHub workflow...");
                const success = await triggerGitHubWorkflow(env);
                console.log(
                    success
                        ? "Workflow triggered successfully"
                        : "Failed to trigger workflow",
                );
            } else {
                console.log("No updates detected. Mirror is current.");
            }
        } catch (error) {
            console.error("Error in scheduled handler:", error);
            throw error;
        }
    },

    /**
     * Handles HTTP requests (for manual triggering and status checks).
     */
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // Health check
        if (url.pathname === "/health") {
            return new Response(JSON.stringify({ status: "ok" }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        // Manual trigger (requires auth)
        if (url.pathname === "/trigger" && request.method === "POST") {
            const authHeader = request.headers.get("Authorization");
            if (authHeader !== `Bearer ${env.GITHUB_TOKEN}`) {
                return new Response("Unauthorized", { status: 401 });
            }

            try {
                const success = await triggerGitHubWorkflow(env);
                return new Response(JSON.stringify({ triggered: success }), {
                    status: success ? 200 : 500,
                    headers: { "Content-Type": "application/json" },
                });
            } catch (error) {
                return new Response(
                    JSON.stringify({ error: (error as Error).message }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
        }

        // Status check
        if (url.pathname === "/" || url.pathname === "/status") {
            try {
                const upstream = await fetchUpstreamMetadata();
                const mirrorUrl =
                    env.MIRROR_CONFIG_URL ||
                    "https://dl.addresskit.com.au/package_show.conf.json";
                const mirror = await fetchMirrorMetadata(mirrorUrl);

                const needsUpdate =
                    !mirror || upstream.modified !== mirror.modified;

                return new Response(
                    JSON.stringify(
                        {
                            upstream: {
                                modified: upstream.modified,
                                resourceCount: upstream.resourceCount,
                            },
                            mirror: mirror
                                ? {
                                      modified: mirror.modified,
                                      syncedAt: mirror.syncedAt,
                                  }
                                : null,
                            needsUpdate,
                            nextCheck: "Monthly on the 18th at 06:00 UTC",
                        },
                        null,
                        2,
                    ),
                    {
                        headers: { "Content-Type": "application/json" },
                    },
                );
            } catch (error) {
                return new Response(
                    JSON.stringify({ error: (error as Error).message }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
        }

        return new Response("Not Found", { status: 404 });
    },
};
