#!/usr/bin/env tsx
/**
 * G-NAF Data Sync Script for AddressKit Mirror
 *
 * This script syncs the latest G-NAF data from data.gov.au to a DigitalOcean Spaces
 * bucket, creating a reliable mirror at dl.addresskit.com.au.
 *
 * Features:
 * - Downloads all G-NAF resources from data.gov.au
 * - Streams large files directly to S3-compatible storage (no memory issues)
 * - Generates a mirrored package_show.conf.json with updated URLs
 * - Supports dry-run mode for testing
 * - Idempotent - only downloads files that don't exist or have changed
 * - Comprehensive error handling and retry logic
 *
 * Environment Variables Required:
 * - DO_SPACES_KEY: DigitalOcean Spaces access key
 * - DO_SPACES_SECRET: DigitalOcean Spaces secret key
 * - DO_SPACES_ENDPOINT: DigitalOcean Spaces endpoint (e.g., syd1.digitaloceanspaces.com)
 * - DO_SPACES_BUCKET: DigitalOcean Spaces bucket name
 * - MIRROR_BASE_URL: Base URL for the mirror (e.g., https://dl.addresskit.com.au)
 *
 * Usage:
 *   pnpm sync              # Run full sync
 *   pnpm sync:dry-run      # Preview what would be synced
 *   pnpm check             # Check for updates without syncing
 *
 * @module gnaf-sync
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const GNAF_PACKAGE_URL =
    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc";

const CONFIG = {
    doSpacesKey: process.env.DO_SPACES_KEY ?? "",
    doSpacesSecret: process.env.DO_SPACES_SECRET ?? "",
    doSpacesEndpoint:
        process.env.DO_SPACES_ENDPOINT ?? "syd1.digitaloceanspaces.com",
    doSpacesBucket: process.env.DO_SPACES_BUCKET ?? "addresskit-gnaf",
    doSpacesRegion: process.env.DO_SPACES_REGION ?? "syd1",
    mirrorBaseUrl:
        process.env.MIRROR_BASE_URL ?? "https://dl.addresskit.com.au",
    // Retry configuration
    maxRetries: 3,
    retryDelay: 5000,
    // Download configuration
    downloadTimeout: 3600000, // 1 hour for large files
};

// Parse CLI arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CHECK_ONLY = args.includes("--check-only");
const VERBOSE = args.includes("--verbose") || args.includes("-v");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GNAFResource {
    id: string;
    name: string;
    url: string;
    format: string;
    size: number | null;
    mimetype: string | null;
    state: string;
    last_modified: string | null;
    created: string;
    description: string | null;
}

interface GNAFPackage {
    success: boolean;
    result: {
        id: string;
        name: string;
        title: string;
        notes: string;
        metadata_modified: string;
        resources: GNAFResource[];
        [key: string]: unknown;
    };
}

interface MirrorConfig {
    version: string;
    synced_at: string;
    source_modified: string;
    source_url: string;
    mirror_base_url: string;
    original_package: GNAFPackage;
    resources: MirrorResource[];
}

interface MirrorResource {
    id: string;
    name: string;
    original_url: string;
    mirror_url: string;
    mirror_path: string;
    format: string;
    size: number | null;
    mimetype: string | null;
    checksum_md5?: string;
    synced_at: string;
}

interface SyncResult {
    success: boolean;
    resourceId: string;
    resourceName: string;
    action: "uploaded" | "skipped" | "failed";
    reason?: string;
    size?: number;
    duration?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats bytes to a human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

/**
 * Formats duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

/**
 * Logs a message with a timestamp.
 */
function log(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    ...args: unknown[]
): void {
    const timestamp = new Date().toISOString();
    const prefix = {
        info: "ℹ️ ",
        warn: "⚠️ ",
        error: "❌",
        debug: "🔍",
    }[level];

    if (level === "debug" && !VERBOSE) return;

    console.log(`[${timestamp}] ${prefix} ${message}`, ...args);
}

/**
 * Sleeps for a specified duration.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff.
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries: number; delay: number; name: string },
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            log(
                "warn",
                `${options.name} failed (attempt ${attempt}/${options.maxRetries}): ${lastError.message}`,
            );

            if (attempt < options.maxRetries) {
                const delay = options.delay * 2 ** (attempt - 1);
                log("info", `Retrying in ${formatDuration(delay)}...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

/**
 * Generates a safe filename from a resource name.
 */
function generateSafeFilename(resource: GNAFResource): string {
    // Extract the original filename from the URL
    const urlPath = new URL(resource.url).pathname;
    const originalFilename = path.basename(urlPath);

    // If it looks like a valid filename, use it
    if (originalFilename && /^[\w\-_.]+$/.test(originalFilename)) {
        return originalFilename;
    }

    // Otherwise, generate from resource name
    const safeName = resource.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const extension = resource.format?.toLowerCase() || "bin";
    return `${safeName}.${extension}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 Client Setup
// ─────────────────────────────────────────────────────────────────────────────

function createS3Client(): S3Client {
    if (!CONFIG.doSpacesKey || !CONFIG.doSpacesSecret) {
        throw new Error(
            "DO_SPACES_KEY and DO_SPACES_SECRET environment variables are required",
        );
    }

    return new S3Client({
        endpoint: `https://${CONFIG.doSpacesEndpoint}`,
        region: CONFIG.doSpacesRegion,
        credentials: {
            accessKeyId: CONFIG.doSpacesKey,
            secretAccessKey: CONFIG.doSpacesSecret,
        },
        forcePathStyle: false, // DigitalOcean Spaces uses virtual-hosted style
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the G-NAF package metadata from data.gov.au.
 */
async function fetchPackageMetadata(): Promise<GNAFPackage> {
    log("info", "Fetching G-NAF package metadata from data.gov.au...");

    const response = await withRetry(
        async () => {
            const res = await fetch(GNAF_PACKAGE_URL, {
                headers: {
                    "User-Agent": "AddressKit-Mirror-Sync/1.0",
                    Accept: "application/json",
                },
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            return res.json() as Promise<GNAFPackage>;
        },
        {
            maxRetries: CONFIG.maxRetries,
            delay: CONFIG.retryDelay,
            name: "Fetch package metadata",
        },
    );

    if (!response.success) {
        throw new Error("data.gov.au API returned success: false");
    }

    log(
        "info",
        `Found ${response.result.resources.length} resources in package`,
    );
    log("debug", `Package last modified: ${response.result.metadata_modified}`);

    return response;
}

/**
 * Checks if a file already exists in the S3 bucket with the correct size.
 */
async function checkFileExists(
    s3Client: S3Client,
    key: string,
    expectedSize: number | null,
): Promise<boolean> {
    try {
        const command = new HeadObjectCommand({
            Bucket: CONFIG.doSpacesBucket,
            Key: key,
        });

        const response = await s3Client.send(command);

        // If we have an expected size, verify it matches
        if (expectedSize !== null && response.ContentLength !== expectedSize) {
            log(
                "debug",
                `File ${key} exists but size mismatch: ${response.ContentLength} vs ${expectedSize}`,
            );
            return false;
        }

        log("debug", `File ${key} already exists with correct size`);
        return true;
    } catch (error) {
        if ((error as { name?: string }).name === "NotFound") {
            return false;
        }
        throw error;
    }
}

/**
 * Downloads a file from a URL and uploads it to S3 using streaming.
 */
async function streamUploadToS3(
    s3Client: S3Client,
    sourceUrl: string,
    destinationKey: string,
    resource: GNAFResource,
): Promise<{ size: number; duration: number }> {
    const startTime = Date.now();

    log("info", `Downloading: ${resource.name}`);
    log("debug", `Source: ${sourceUrl}`);
    log("debug", `Destination: ${destinationKey}`);

    // Fetch with streaming
    const response = await fetch(sourceUrl, {
        headers: {
            "User-Agent": "AddressKit-Mirror-Sync/1.0",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to download ${resource.name}: HTTP ${response.status}`,
        );
    }

    if (!response.body) {
        throw new Error(`No response body for ${resource.name}`);
    }

    const contentLength = Number.parseInt(
        response.headers.get("content-length") ?? "0",
        10,
    );
    log(
        "info",
        `File size: ${formatBytes(contentLength || resource.size || 0)}`,
    );

    // Use multipart upload for large files
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: CONFIG.doSpacesBucket,
            Key: destinationKey,
            // @ts-expect-error - Types don't perfectly align but this works
            Body: Readable.fromWeb(response.body),
            ContentType: resource.mimetype || "application/octet-stream",
            ACL: "public-read",
            Metadata: {
                "original-url": sourceUrl,
                "resource-id": resource.id,
                "synced-at": new Date().toISOString(),
            },
        },
        // 10MB parts for multipart upload
        partSize: 10 * 1024 * 1024,
        // Concurrent uploads
        queueSize: 4,
    });

    // Track progress
    let lastLoggedPercent = 0;
    upload.on("httpUploadProgress", (progress) => {
        if (progress.loaded && contentLength > 0) {
            const percent = Math.floor((progress.loaded / contentLength) * 100);
            // Log every 10%
            if (percent >= lastLoggedPercent + 10) {
                log(
                    "info",
                    `  Progress: ${percent}% (${formatBytes(progress.loaded)})`,
                );
                lastLoggedPercent = percent;
            }
        }
    });

    await upload.done();

    const duration = Date.now() - startTime;
    const size = contentLength || resource.size || 0;

    log(
        "info",
        `✅ Uploaded ${resource.name} (${formatBytes(size)} in ${formatDuration(duration)})`,
    );

    return { size, duration };
}

/**
 * Syncs a single resource to the mirror.
 */
async function syncResource(
    s3Client: S3Client,
    resource: GNAFResource,
): Promise<SyncResult> {
    const filename = generateSafeFilename(resource);
    const key = `gnaf/${filename}`;
    const mirrorUrl = `${CONFIG.mirrorBaseUrl}/${key}`;

    // Skip non-active resources
    if (resource.state !== "active") {
        return {
            success: true,
            resourceId: resource.id,
            resourceName: resource.name,
            action: "skipped",
            reason: "Resource is not active",
        };
    }

    // Check if file already exists
    const exists = await checkFileExists(s3Client, key, resource.size);
    if (exists) {
        return {
            success: true,
            resourceId: resource.id,
            resourceName: resource.name,
            action: "skipped",
            reason: "File already exists with correct size",
        };
    }

    if (DRY_RUN) {
        log("info", `[DRY RUN] Would upload: ${resource.name} -> ${key}`);
        return {
            success: true,
            resourceId: resource.id,
            resourceName: resource.name,
            action: "skipped",
            reason: "Dry run mode",
        };
    }

    try {
        const { size, duration } = await withRetry(
            () => streamUploadToS3(s3Client, resource.url, key, resource),
            {
                maxRetries: CONFIG.maxRetries,
                delay: CONFIG.retryDelay,
                name: `Upload ${resource.name}`,
            },
        );

        return {
            success: true,
            resourceId: resource.id,
            resourceName: resource.name,
            action: "uploaded",
            size,
            duration,
        };
    } catch (error) {
        log(
            "error",
            `Failed to sync ${resource.name}: ${(error as Error).message}`,
        );
        return {
            success: false,
            resourceId: resource.id,
            resourceName: resource.name,
            action: "failed",
            reason: (error as Error).message,
        };
    }
}

/**
 * Generates the mirror configuration file.
 */
function generateMirrorConfig(
    originalPackage: GNAFPackage,
    syncResults: SyncResult[],
): MirrorConfig {
    const mirrorResources: MirrorResource[] = [];

    for (const resource of originalPackage.result.resources) {
        if (resource.state !== "active") continue;

        const filename = generateSafeFilename(resource);
        const key = `gnaf/${filename}`;
        const mirrorUrl = `${CONFIG.mirrorBaseUrl}/${key}`;

        const syncResult = syncResults.find(
            (r) => r.resourceId === resource.id,
        );

        mirrorResources.push({
            id: resource.id,
            name: resource.name,
            original_url: resource.url,
            mirror_url: mirrorUrl,
            mirror_path: key,
            format: resource.format,
            size: resource.size,
            mimetype: resource.mimetype,
            synced_at: new Date().toISOString(),
        });
    }

    // Create a modified package with mirror URLs
    const modifiedPackage = JSON.parse(
        JSON.stringify(originalPackage),
    ) as GNAFPackage;
    for (const resource of modifiedPackage.result.resources) {
        const mirrorResource = mirrorResources.find(
            (r) => r.id === resource.id,
        );
        if (mirrorResource) {
            resource.url = mirrorResource.mirror_url;
        }
    }

    return {
        version: "1.0",
        synced_at: new Date().toISOString(),
        source_modified: originalPackage.result.metadata_modified,
        source_url: GNAF_PACKAGE_URL,
        mirror_base_url: CONFIG.mirrorBaseUrl,
        original_package: modifiedPackage,
        resources: mirrorResources,
    };
}

/**
 * Uploads the mirror configuration file.
 */
async function uploadMirrorConfig(
    s3Client: S3Client,
    config: MirrorConfig,
): Promise<void> {
    const configJson = JSON.stringify(config, null, 2);
    const key = "package_show.conf.json";

    if (DRY_RUN) {
        log("info", `[DRY RUN] Would upload mirror config to ${key}`);
        log("debug", "Config preview:", `${configJson.slice(0, 500)}...`);
        return;
    }

    log("info", "Uploading mirror configuration...");

    const command = new PutObjectCommand({
        Bucket: CONFIG.doSpacesBucket,
        Key: key,
        Body: configJson,
        ContentType: "application/json",
        ACL: "public-read",
        CacheControl: "public, max-age=3600", // Cache for 1 hour
        Metadata: {
            "synced-at": config.synced_at,
            "source-modified": config.source_modified,
        },
    });

    await s3Client.send(command);

    log("info", `✅ Uploaded mirror config: ${CONFIG.mirrorBaseUrl}/${key}`);
}

/**
 * Main sync function.
 */
async function main(): Promise<void> {
    console.log("\n");
    console.log(
        "╔═══════════════════════════════════════════════════════════════════╗",
    );
    console.log(
        "║                 G-NAF Mirror Sync for AddressKit                  ║",
    );
    console.log(
        "╚═══════════════════════════════════════════════════════════════════╝",
    );
    console.log("");

    if (DRY_RUN) {
        log("warn", "Running in DRY RUN mode - no files will be uploaded");
    }

    if (CHECK_ONLY) {
        log("info", "Running in CHECK ONLY mode - will only report status");
    }

    const startTime = Date.now();

    try {
        // Fetch package metadata
        const packageData = await fetchPackageMetadata();

        log("info", `Package: ${packageData.result.title}`);
        log("info", `Last modified: ${packageData.result.metadata_modified}`);

        // Filter active resources
        const activeResources = packageData.result.resources.filter(
            (r) => r.state === "active",
        );
        log("info", `Active resources: ${activeResources.length}`);

        // Calculate total size
        const totalSize = activeResources.reduce(
            (sum, r) => sum + (r.size || 0),
            0,
        );
        log("info", `Total size: ${formatBytes(totalSize)}`);

        console.log("\n📦 Resources to sync:");
        for (const resource of activeResources) {
            const size = resource.size
                ? formatBytes(resource.size)
                : "unknown size";
            console.log(`   - ${resource.name} (${resource.format}, ${size})`);
        }
        console.log("");

        if (CHECK_ONLY) {
            log("info", "Check complete. Run without --check-only to sync.");
            return;
        }

        // Initialize S3 client
        const s3Client = createS3Client();

        // Sync all resources
        const results: SyncResult[] = [];
        for (const resource of activeResources) {
            console.log("");
            const result = await syncResource(s3Client, resource);
            results.push(result);
        }

        // Generate and upload mirror config
        console.log("");
        const mirrorConfig = generateMirrorConfig(packageData, results);
        await uploadMirrorConfig(s3Client, mirrorConfig);

        // Summary
        const duration = Date.now() - startTime;
        const uploaded = results.filter((r) => r.action === "uploaded").length;
        const skipped = results.filter((r) => r.action === "skipped").length;
        const failed = results.filter((r) => r.action === "failed").length;
        const uploadedSize = results
            .filter((r) => r.action === "uploaded")
            .reduce((sum, r) => sum + (r.size || 0), 0);

        console.log("\n");
        console.log(
            "═══════════════════════════════════════════════════════════════════",
        );
        console.log(
            "                          Sync Summary                              ",
        );
        console.log(
            "═══════════════════════════════════════════════════════════════════",
        );
        console.log(
            `   Uploaded:  ${uploaded} files (${formatBytes(uploadedSize)})`,
        );
        console.log(`   Skipped:   ${skipped} files (already up to date)`);
        console.log(`   Failed:    ${failed} files`);
        console.log(`   Duration:  ${formatDuration(duration)}`);
        console.log(
            "═══════════════════════════════════════════════════════════════════",
        );
        console.log("");

        if (failed > 0) {
            log("error", "Some resources failed to sync:");
            for (const result of results.filter((r) => r.action === "failed")) {
                console.log(`   ❌ ${result.resourceName}: ${result.reason}`);
            }
            process.exit(1);
        }

        log(
            "info",
            `Mirror URL: ${CONFIG.mirrorBaseUrl}/package_show.conf.json`,
        );
    } catch (error) {
        log("error", `Sync failed: ${(error as Error).message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run main function
main();
