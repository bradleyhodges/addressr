#!/usr/bin/env node
/**
 * Seed a tiny, deterministic fixture index into OpenSearch for fast local testing.
 *
 * Why:
 * - Lets you run integration tests in seconds (no G-NAF download/indexing).
 * - Decouples "refactor safety" from "full data pipeline".
 *
 * Usage:
 *   node tooling/smoke/seed-fixtures.js
 *
 * Env:
 *   ELASTIC_PROTOCOL=http
 *   ELASTIC_HOST=localhost
 *   ELASTIC_PORT=9200
 *   INDEX_NAME=addresskit_smoke
 *   RESET_INDEX=1                 # delete & recreate index (recommended)
 *   WAIT_FOR_OS=1                 # wait for OpenSearch readiness (default: 1)
 */

const cfg = {
    protocol: process.env.ELASTIC_PROTOCOL || "http",
    host: process.env.ELASTIC_HOST || "localhost",
    port: Number(process.env.ELASTIC_PORT || 9200),
    index: process.env.INDEX_NAME || "addresskit_smoke",
    reset: process.env.RESET_INDEX === "1",
    wait: process.env.WAIT_FOR_OS !== "0",
};

const base = `${cfg.protocol}://${cfg.host}:${cfg.port}`;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
        clearTimeout(t);
    }
}

async function retry(fn, { attempts = 30, backoffMs = 400 } = {}) {
    let last;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn(i);
        } catch (e) {
            last = e;
            await sleep(backoffMs * i);
        }
    }
    throw last;
}

async function waitForOpenSearch() {
    const url = `${base}/`;
    await retry(
        async () => {
            const res = await fetchWithTimeout(url, {}, 5000);
            if (!res.ok)
                throw new Error(`OpenSearch not ready (${res.status})`);
            return true;
        },
        { attempts: 40, backoffMs: 250 },
    );

    console.log(`✅ OpenSearch ready: ${url}`);
}

async function deleteIndexIfExists() {
    const url = `${base}/${encodeURIComponent(cfg.index)}`;
    const res = await fetchWithTimeout(url, { method: "DELETE" }, 10000);
    // 200/404 both acceptable for reset path
    if (res.status !== 200 && res.status !== 404) {
        const body = await res.text().catch(() => "");
        throw new Error(`Failed deleting index (${res.status}): ${body}`);
    }
    if (res.status === 200) console.log(`🧹 Deleted index: ${cfg.index}`);
}

async function createIndex() {
    // Minimal mapping for smoke testing. Later, swap this mapping to match your real index.
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

    const url = `${base}/${encodeURIComponent(cfg.index)}`;
    const res = await fetchWithTimeout(
        url,
        {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(mapping),
        },
        15000,
    );

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `Failed creating index ${cfg.index} (${res.status}): ${body}`,
        );
    }

    console.log(`✅ Created index: ${cfg.index}`);
}

async function bulkInsert() {
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
        {
            id: "4",
            full_address: "99 Beaufort St, Mount Lawley WA 6050",
            suburb: "MOUNT LAWLEY",
            state: "WA",
            postcode: "6050",
        },
    ];

    const lines = [];
    for (const d of docs) {
        lines.push(JSON.stringify({ index: { _index: cfg.index, _id: d.id } }));
        lines.push(JSON.stringify(d));
    }
    lines.push("");

    const res = await fetchWithTimeout(
        `${base}/_bulk`,
        {
            method: "POST",
            headers: { "content-type": "application/x-ndjson" },
            body: lines.join("\n"),
        },
        20000,
    );

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Bulk insert failed (${res.status}): ${body}`);
    }

    const json = await res.json().catch(() => ({}));
    if (json.errors) {
        throw new Error(
            `Bulk insert had errors: ${JSON.stringify(json, null, 2)}`,
        );
    }

    await fetchWithTimeout(
        `${base}/${encodeURIComponent(cfg.index)}/_refresh`,
        { method: "POST" },
        10000,
    );

    console.log(`✅ Inserted fixtures: ${docs.length} docs`);
}

async function sanityQuery() {
    const q = encodeURIComponent("Perth");
    const url = `${base}/${encodeURIComponent(cfg.index)}/_search?q=${q}`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Sanity search failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    const hits = json?.hits?.total?.value ?? json?.hits?.hits?.length ?? 0;
    console.log(`✅ Sanity search OK ("Perth") hits: ${hits}`);
}

(async () => {
    console.log(
        `Seeding fixtures with config:\n${JSON.stringify(cfg, null, 2)}`,
    );

    if (cfg.wait) await waitForOpenSearch();
    if (cfg.reset) await deleteIndexIfExists();
    await createIndex();
    await bulkInsert();
    await sanityQuery();

    console.log("✅ Fixture seeding complete.");
})().catch((err) => {
    console.error("❌ Fixture seeding failed.");
    console.error(err?.stack || err);
    process.exit(1);
});
