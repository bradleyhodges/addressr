#!/usr/bin/env node
/**
 * Cross-platform smoke test for AddressKit.
 *
 * - Verifies OpenSearch reachable
 * - Optionally seeds a fixture index (fast local testing)
 * - Optionally checks API endpoint
 *
 * Usage:
 *   pnpm -w smoke
 *
 * Env:
 *   ELASTIC_PROTOCOL=http
 *   ELASTIC_HOST=localhost
 *   ELASTIC_PORT=9200
 *   API_URL=http://localhost:8080
 *   SEED_FIXTURES=1
 *   INDEX_NAME=addresskit_smoke
 */

const DEFAULTS = {
    ELASTIC_PROTOCOL: process.env.ELASTIC_PROTOCOL || "http",
    ELASTIC_HOST: process.env.ELASTIC_HOST || "localhost",
    ELASTIC_PORT: Number(process.env.ELASTIC_PORT || 9200),
    API_URL: process.env.API_URL || "http://localhost:8080",
    SEED_FIXTURES: process.env.SEED_FIXTURES === "1",
    INDEX_NAME: process.env.INDEX_NAME || "addresskit_smoke",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(t);
    }
}

async function retry(fn, { attempts = 10, backoffMs = 500 } = {}) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn(i);
        } catch (err) {
            lastErr = err;
            await sleep(backoffMs * i);
        }
    }
    throw lastErr;
}

function osBase() {
    return `${DEFAULTS.ELASTIC_PROTOCOL}://${DEFAULTS.ELASTIC_HOST}:${DEFAULTS.ELASTIC_PORT}`;
}

async function assertOpenSearch() {
    const url = `${osBase()}/`;
    await retry(
        async () => {
            const res = await fetchWithTimeout(url, {}, 6000);
            if (!res.ok) throw new Error(`OpenSearch returned ${res.status}`);
            const json = await res.json().catch(() => ({}));
            if (!json.version) {
                // Still acceptable, but helpful to flag
                console.warn(
                    "⚠ OpenSearch reachable but version not detected in response.",
                );
            }
            return true;
        },
        { attempts: 20, backoffMs: 500 },
    );

    console.log(`✅ OpenSearch reachable: ${url}`);
}

async function seedFixtures() {
    const index = DEFAULTS.INDEX_NAME;
    const base = osBase();

    // Minimal mapping example—replace with your actual mapping later.
    // Keep it tiny to ensure fast local cycles.
    const mapping = {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: {
            properties: {
                full_address: { type: "text" },
                suburb: { type: "keyword" },
                state: { type: "keyword" },
                postcode: { type: "keyword" },
            },
        },
    };

    const docs = [
        {
            id: "1",
            full_address: "10 St Georges Tce, Perth WA 6000",
            suburb: "PERTH",
            state: "WA",
            postcode: "6000",
        },
        {
            id: "2",
            full_address: "200 Adelaide Tce, East Perth WA 6004",
            suburb: "EAST PERTH",
            state: "WA",
            postcode: "6004",
        },
        {
            id: "3",
            full_address: "1 Barrack St, Perth WA 6000",
            suburb: "PERTH",
            state: "WA",
            postcode: "6000",
        },
    ];

    // Delete if exists (ignore errors)
    await fetch(`${base}/${encodeURIComponent(index)}`, {
        method: "DELETE",
    }).catch(() => {});

    // Create index
    {
        const res = await fetchWithTimeout(
            `${base}/${encodeURIComponent(index)}`,
            {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(mapping),
            },
            10000,
        );

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(
                `Failed to create index ${index}: ${res.status} ${body}`,
            );
        }
    }

    // Bulk insert
    const bulkLines = [];
    for (const d of docs) {
        bulkLines.push(JSON.stringify({ index: { _index: index, _id: d.id } }));
        bulkLines.push(JSON.stringify(d));
    }
    bulkLines.push(""); // newline at end

    {
        const res = await fetchWithTimeout(
            `${base}/_bulk`,
            {
                method: "POST",
                headers: { "content-type": "application/x-ndjson" },
                body: bulkLines.join("\n"),
            },
            15000,
        );

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Bulk insert failed: ${res.status} ${body}`);
        }
        const json = await res.json().catch(() => ({}));
        if (json.errors) {
            throw new Error(
                `Bulk insert had errors: ${JSON.stringify(json, null, 2)}`,
            );
        }
    }

    // Refresh
    await fetchWithTimeout(
        `${base}/${encodeURIComponent(index)}/_refresh`,
        { method: "POST" },
        10000,
    );

    console.log(`✅ Seeded fixture index: ${index} (${docs.length} docs)`);
}

async function assertApi() {
    // Adjust endpoint to whatever your server exposes.
    const url = `${DEFAULTS.API_URL}/`;
    try {
        const res = await fetchWithTimeout(url, {}, 4000);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        console.log(`✅ API reachable: ${url}`);
    } catch (err) {
        console.warn(`⚠ API check skipped/failed: ${url}`);
        console.warn(`   ${err?.message || err}`);
    }
}

async function main() {
    console.log(`Smoke config: ${JSON.stringify(DEFAULTS, null, 2)}`);
    await assertOpenSearch();
    if (DEFAULTS.SEED_FIXTURES) await seedFixtures();
    await assertApi();
    console.log("✅ Smoke test complete.");
}

main().catch((err) => {
    console.error("❌ Smoke test failed.");
    console.error(err?.stack || err);
    process.exit(1);
});
