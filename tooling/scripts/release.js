#!/usr/bin/env node
/**
 * AddressKit Release Script
 *
 * Builds and publishes the package to all registries:
 * - npm (npmjs.com)
 * - GitHub Packages (npm.pkg.github.com)
 * - Docker Hub (bradleyhodges/addresskit)
 * - GitHub Container Registry (ghcr.io/bradleyhodges/addresskit)
 *
 * Usage:
 *   node tooling/scripts/release.js [options]
 *
 * Options:
 *   --skip-npm       Skip npm publish
 *   --skip-github    Skip GitHub npm publish
 *   --skip-docker    Skip Docker Hub publish
 *   --skip-ghcr      Skip GitHub Container Registry publish
 *   --skip-git-tag   Skip git tag creation
 *   --dry-run        Show what would be done without executing
 *
 * Environment Variables Required:
 *   DOCKER_ID_USER   - Docker Hub username
 *   DOCKER_ID_PASS   - Docker Hub password/token
 *   GITHUB_TOKEN     - GitHub PAT with write:packages scope (for GHCR)
 *
 * @module release
 */

const { execSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

// ANSI color codes for terminal output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

// Track results for each step
const results = {
    build: { status: "pending", message: "" },
    tarball: { status: "pending", message: "" },
    npm: { status: "pending", message: "" },
    github: { status: "pending", message: "" },
    dockerBuild: { status: "pending", message: "" },
    dockerPush: { status: "pending", message: "" },
    ghcrBuild: { status: "pending", message: "" },
    ghcrPush: { status: "pending", message: "" },
    gitTag: { status: "pending", message: "" },
};

/**
 * Logs a styled message to the console.
 *
 * @param {string} emoji - Emoji prefix for the message.
 * @param {string} message - The message to display.
 * @param {string} [color] - ANSI color code.
 */
function log(emoji, message, color = colors.reset) {
    console.log(`${color}${emoji} ${message}${colors.reset}`);
}

/**
 * Logs a section header.
 *
 * @param {string} title - Section title.
 */
function logSection(title) {
    console.log();
    console.log(
        `${colors.cyan}${colors.bright}━━━ ${title} ━━━${colors.reset}`,
    );
    console.log();
}

/**
 * Executes a shell command with proper error handling.
 *
 * @param {string} cmd - The command to execute.
 * @param {Object} [options] - Execution options.
 * @param {boolean} [options.silent] - Suppress stdout.
 * @returns {{success: boolean, output: string, error: Error|null}} Result object.
 */
function exec(cmd, options = {}) {
    const { silent = false } = options;

    log("▶", cmd, colors.dim);

    if (args.dryRun) {
        log("⏭", "(dry run - skipped)", colors.yellow);
        return { success: true, output: "", error: null };
    }

    try {
        const output = execSync(cmd, {
            encoding: "utf8",
            stdio: silent ? "pipe" : "inherit",
            cwd: projectRoot,
        });
        return { success: true, output: output || "", error: null };
    } catch (error) {
        return { success: false, output: "", error };
    }
}

/**
 * Parses command line arguments.
 *
 * @returns {Object} Parsed arguments.
 */
function parseArgs() {
    const argv = process.argv.slice(2);
    return {
        skipNpm: argv.includes("--skip-npm"),
        skipGithub: argv.includes("--skip-github"),
        skipDocker: argv.includes("--skip-docker"),
        skipGhcr: argv.includes("--skip-ghcr"),
        skipGitTag: argv.includes("--skip-git-tag"),
        dryRun: argv.includes("--dry-run"),
        help: argv.includes("--help") || argv.includes("-h"),
    };
}

/**
 * Displays help information.
 */
function showHelp() {
    console.log(`
${colors.bright}AddressKit Release Script${colors.reset}

Builds and publishes the package to all registries.
Continues on failure of individual steps and reports summary at the end.

${colors.cyan}Usage:${colors.reset}
  node tooling/scripts/release.js [options]
  pnpm release:all [options]

${colors.cyan}Options:${colors.reset}
  --skip-npm       Skip npm publish
  --skip-github    Skip GitHub npm publish
  --skip-docker    Skip Docker Hub publish
  --skip-ghcr      Skip GitHub Container Registry publish
  --skip-git-tag   Skip git tag creation
  --dry-run        Show what would be done without executing
  --help, -h       Show this help message

${colors.cyan}Environment Variables:${colors.reset}
  DOCKER_ID_USER   Docker Hub username
  DOCKER_ID_PASS   Docker Hub password/token
  GITHUB_TOKEN     GitHub PAT with write:packages scope

${colors.cyan}Examples:${colors.reset}
  # Full release to all registries
  pnpm release:all

  # Skip Docker registries
  pnpm release:all --skip-docker --skip-ghcr

  # Dry run to see what would happen
  pnpm release:all --dry-run
`);
}

/**
 * Checks for optional environment variables for Docker publishing.
 * Credentials are optional if already logged in via Docker Desktop.
 *
 * @param {Object} args - Parsed arguments.
 * @returns {Object} Info about credential sources.
 */
function checkEnv(args) {
    const info = [];

    if (!args.skipDocker) {
        if (process.env.DOCKER_ID_USER && process.env.DOCKER_ID_PASS) {
            info.push("Docker Hub: using environment credentials");
        } else {
            info.push("Docker Hub: using Docker Desktop session");
        }
    }

    if (!args.skipGhcr) {
        if (process.env.GITHUB_TOKEN) {
            info.push("GHCR: using GITHUB_TOKEN");
        } else {
            info.push("GHCR: using Docker Desktop session");
        }
    }

    return { info };
}

/**
 * Prints the final summary of all release steps.
 */
function printSummary() {
    console.log();
    console.log(
        `${colors.bright}╔════════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(
        `${colors.bright}║              Release Summary               ║${colors.reset}`,
    );
    console.log(
        `${colors.bright}╚════════════════════════════════════════════╝${colors.reset}`,
    );
    console.log();

    const stepNames = {
        build: "Build",
        tarball: "Create Tarball",
        npm: "Publish to npm",
        github: "Publish to GitHub Packages",
        dockerBuild: "Build Docker Image",
        dockerPush: "Push to Docker Hub",
        ghcrBuild: "Build GHCR Image",
        ghcrPush: "Push to GHCR",
        gitTag: "Create Git Tag",
    };

    let hasFailures = false;

    for (const [key, result] of Object.entries(results)) {
        const name = stepNames[key] || key;
        let icon, color;

        switch (result.status) {
            case "success":
                icon = "✓";
                color = colors.green;
                break;
            case "failed":
                icon = "✖";
                color = colors.red;
                hasFailures = true;
                break;
            case "skipped":
                icon = "⏭";
                color = colors.yellow;
                break;
            default:
                icon = "○";
                color = colors.dim;
        }

        const statusText = result.message
            ? `${result.status} - ${result.message}`
            : result.status;
        console.log(`  ${color}${icon} ${name.padEnd(26)} ${statusText}${colors.reset}`);
    }

    console.log();

    if (hasFailures) {
        log(
            "⚠",
            "Release completed with some failures. Check the summary above.",
            colors.yellow,
        );
    } else {
        log("🎉", "All release steps completed successfully!", colors.green);
    }

    console.log();
    log("📦", `npm: https://www.npmjs.com/package/${packageName}`, colors.cyan);
    log(
        "📦",
        "GitHub: https://github.com/bradleyhodges/addresskit/pkgs/npm/addresskit",
        colors.cyan,
    );
    log(
        "🐳",
        "Docker Hub: https://hub.docker.com/r/bradleyhodges/addresskit",
        colors.cyan,
    );
    log("🐳", "GHCR: https://ghcr.io/bradleyhodges/addresskit", colors.cyan);
    console.log();

    return hasFailures;
}

// Project root directory
const projectRoot = path.resolve(__dirname, "../..");

// Parse arguments
const args = parseArgs();

// Show help if requested
if (args.help) {
    showHelp();
    process.exit(0);
}

// Read package.json
const pkg = JSON.parse(
    readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const version = pkg.version;
const packageName = pkg.name;
const tarballName = `bradleyhodges-addresskit-${version}.tgz`;

/**
 * Main release function.
 */
async function release() {
    console.log();
    console.log(
        `${colors.magenta}${colors.bright}╔════════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(
        `${colors.magenta}${colors.bright}║     AddressKit Release v${version.padEnd(17)}  ║${colors.reset}`,
    );
    console.log(
        `${colors.magenta}${colors.bright}╚════════════════════════════════════════════╝${colors.reset}`,
    );

    if (args.dryRun) {
        log("🧪", "DRY RUN MODE - No changes will be made", colors.yellow);
    }

    // Show credential info
    const envInfo = checkEnv(args);
    if (envInfo.info.length > 0) {
        for (const info of envInfo.info) {
            log("🔑", info, colors.dim);
        }
    }

    // Step 1: Build (critical - must succeed)
    logSection("Building Package");
    log("📦", `Building ${packageName}@${version}...`, colors.blue);
    const buildResult = exec("pnpm run build");
    if (buildResult.success) {
        results.build = { status: "success", message: "" };
        log("✓", "Build complete", colors.green);
    } else {
        results.build = { status: "failed", message: "Build failed" };
        log("✖", "Build failed - cannot continue", colors.red);
        printSummary();
        process.exit(1);
    }

    // Step 2: Create tarball (critical - must succeed)
    logSection("Creating Package Tarball");
    log("📦", `Creating ${tarballName}...`, colors.blue);
    const tarballResult = exec("npm pack");
    if (tarballResult.success) {
        results.tarball = { status: "success", message: "" };
        log("✓", "Tarball created", colors.green);
    } else {
        results.tarball = { status: "failed", message: "Failed to create tarball" };
        log("✖", "Failed to create tarball - cannot continue", colors.red);
        printSummary();
        process.exit(1);
    }

    // Step 3: Publish to npm
    if (!args.skipNpm) {
        logSection("Publishing to npm");
        log("📤", "Publishing to npmjs.com...", colors.blue);
        const npmResult = exec(`npm publish ${tarballName} --access public`);
        if (npmResult.success) {
            results.npm = { status: "success", message: "" };
            log("✓", "Published to npm", colors.green);
        } else {
            const isAlreadyPublished =
                npmResult.error?.message?.includes("previously published") ||
                npmResult.error?.message?.includes("cannot publish over");
            results.npm = {
                status: "failed",
                message: isAlreadyPublished
                    ? "Version already published"
                    : "Publish failed",
            };
            log(
                "✖",
                isAlreadyPublished
                    ? "Version already published to npm"
                    : "Failed to publish to npm",
                colors.red,
            );
        }
    } else {
        results.npm = { status: "skipped", message: "" };
        log("⏭", "Skipping npm publish", colors.yellow);
    }

    // Step 4: Publish to GitHub npm
    if (!args.skipGithub) {
        logSection("Publishing to GitHub Packages");
        log("📤", "Publishing to npm.pkg.github.com...", colors.blue);
        const githubResult = exec(
            `npm publish ${tarballName} --access public --registry=https://npm.pkg.github.com`,
        );
        if (githubResult.success) {
            results.github = { status: "success", message: "" };
            log("✓", "Published to GitHub Packages", colors.green);
        } else {
            const isAlreadyPublished =
                githubResult.error?.message?.includes("previously published") ||
                githubResult.error?.message?.includes("cannot publish over");
            results.github = {
                status: "failed",
                message: isAlreadyPublished
                    ? "Version already published"
                    : "Publish failed",
            };
            log(
                "✖",
                isAlreadyPublished
                    ? "Version already published to GitHub Packages"
                    : "Failed to publish to GitHub Packages",
                colors.red,
            );
        }
    } else {
        results.github = { status: "skipped", message: "" };
        log("⏭", "Skipping GitHub npm publish", colors.yellow);
    }

    // Step 5: Build Docker image for Docker Hub
    if (!args.skipDocker) {
        logSection("Building Docker Image (Docker Hub)");
        log("🐳", "Building Docker image...", colors.blue);
        const dockerBuildResult = exec(
            `docker build -f infra/docker/Dockerfile --build-arg PACKAGE_TGZ=${tarballName} --build-arg PACKAGE=${packageName} --build-arg VERSION=${version} -t bradleyhodges/addresskit:${version} -t bradleyhodges/addresskit:latest .`,
        );
        if (dockerBuildResult.success) {
            results.dockerBuild = { status: "success", message: "" };
            log("✓", "Docker image built", colors.green);

            // Push to Docker Hub
            logSection("Pushing to Docker Hub");

            // If credentials are provided, login first; otherwise assume Docker Desktop session
            if (process.env.DOCKER_ID_USER && process.env.DOCKER_ID_PASS) {
                log("🔐", "Logging in to Docker Hub...", colors.blue);
                exec(
                    `echo ${process.env.DOCKER_ID_PASS} | docker login --username ${process.env.DOCKER_ID_USER} --password-stdin`,
                    { silent: true },
                );
            } else {
                log("🔐", "Using existing Docker Desktop session...", colors.blue);
            }

            log("📤", "Pushing to Docker Hub...", colors.blue);
            const pushVersionResult = exec(
                `docker push bradleyhodges/addresskit:${version}`,
            );
            const pushLatestResult = exec(
                "docker push bradleyhodges/addresskit:latest",
            );

            if (pushVersionResult.success && pushLatestResult.success) {
                results.dockerPush = { status: "success", message: "" };
                log("✓", "Pushed to Docker Hub", colors.green);
            } else {
                results.dockerPush = { status: "failed", message: "Push failed - check Docker login" };
                log("✖", "Failed to push to Docker Hub (are you logged in?)", colors.red);
            }
        } else {
            results.dockerBuild = { status: "failed", message: "Build failed" };
            results.dockerPush = { status: "skipped", message: "Build failed" };
            log("✖", "Failed to build Docker image", colors.red);
        }
    } else {
        results.dockerBuild = { status: "skipped", message: "" };
        results.dockerPush = { status: "skipped", message: "" };
        log("⏭", "Skipping Docker Hub", colors.yellow);
    }

    // Step 6: Build and push to GHCR
    if (!args.skipGhcr) {
        logSection("Building Docker Image (GHCR)");
        log("🐳", "Building Docker image for GHCR...", colors.blue);
        const ghcrBuildResult = exec(
            `docker build -f infra/docker/Dockerfile --build-arg PACKAGE_TGZ=${tarballName} --build-arg PACKAGE=${packageName} --build-arg VERSION=${version} -t ghcr.io/bradleyhodges/addresskit:${version} -t ghcr.io/bradleyhodges/addresskit:latest .`,
        );

        if (ghcrBuildResult.success) {
            results.ghcrBuild = { status: "success", message: "" };
            log("✓", "Docker image built for GHCR", colors.green);

            // Push to GHCR
            logSection("Pushing to GitHub Container Registry");

            // If GITHUB_TOKEN is provided, login first; otherwise assume existing session
            if (process.env.GITHUB_TOKEN) {
                log("🔐", "Logging in to GHCR...", colors.blue);
                exec(
                    `echo ${process.env.GITHUB_TOKEN} | docker login ghcr.io -u bradleyhodges --password-stdin`,
                    { silent: true },
                );
            } else {
                log("🔐", "Using existing Docker session for GHCR...", colors.blue);
            }

            log("📤", "Pushing to GHCR...", colors.blue);
            const ghcrPushVersionResult = exec(
                `docker push ghcr.io/bradleyhodges/addresskit:${version}`,
            );
            const ghcrPushLatestResult = exec(
                "docker push ghcr.io/bradleyhodges/addresskit:latest",
            );

            if (ghcrPushVersionResult.success && ghcrPushLatestResult.success) {
                results.ghcrPush = { status: "success", message: "" };
                log("✓", "Pushed to GHCR", colors.green);
            } else {
                results.ghcrPush = { status: "failed", message: "Push failed - check GHCR login" };
                log("✖", "Failed to push to GHCR (are you logged in?)", colors.red);
            }
        } else {
            results.ghcrBuild = { status: "failed", message: "Build failed" };
            results.ghcrPush = { status: "skipped", message: "Build failed" };
            log("✖", "Failed to build Docker image for GHCR", colors.red);
        }
    } else {
        results.ghcrBuild = { status: "skipped", message: "" };
        results.ghcrPush = { status: "skipped", message: "" };
        log("⏭", "Skipping GHCR", colors.yellow);
    }

    // Step 7: Create git tag
    if (!args.skipGitTag) {
        logSection("Creating Git Tag");
        log("🏷", `Creating tag v${version}...`, colors.blue);
        const tagResult = exec(`git tag v${version}`);
        const pushResult = exec("git push origin master --tags");

        if (tagResult.success || pushResult.success) {
            results.gitTag = { status: "success", message: "" };
            log("✓", "Git tag created and pushed", colors.green);
        } else {
            const tagExists = tagResult.error?.message?.includes("already exists");
            results.gitTag = {
                status: "failed",
                message: tagExists ? "Tag already exists" : "Failed to create tag",
            };
            log(
                "✖",
                tagExists
                    ? `Tag v${version} already exists`
                    : "Failed to create git tag",
                colors.red,
            );
        }
    } else {
        results.gitTag = { status: "skipped", message: "" };
        log("⏭", "Skipping git tag", colors.yellow);
    }

    // Print summary
    const hasFailures = printSummary();
    process.exit(hasFailures ? 1 : 0);
}

// Run the release
release().catch((error) => {
    log("✖", `Unexpected error: ${error.message}`, colors.red);
    printSummary();
    process.exit(1);
});
