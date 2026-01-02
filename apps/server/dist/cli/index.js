#!/usr/bin/env node
"use strict";
/**
 * AddressKit CLI - Unified Command Line Interface
 *
 * Provides a beautiful, user-friendly CLI for managing the AddressKit
 * address validation and autocomplete service.
 *
 * Usage:
 *   addresskit load    - Load G-NAF data into the search index
 *   addresskit start   - Start the REST API server
 *
 * Options:
 *   -d, --daemon       Run in background (daemon) mode
 *   -v, --version      Display version information
 *   -h, --help         Display help information
 */
Object.defineProperty(exports, "__esModule", { value: true });
const version_1 = require("@repo/addresskit-core/version");
const commander_1 = require("commander");
const dotenv = require("dotenv");
const terminalUI_1 = require("../service/helpers/terminalUI");
// Load environment variables
dotenv.config();
/**
 * Main CLI application instance.
 */
const program = new commander_1.Command();
/**
 * Configures the CLI program with metadata and global options.
 */
program
    .name("addresskit")
    .description(terminalUI_1.theme.muted("Australian address validation, search, and autocomplete engine powered by G-NAF"))
    .version(version_1.version, "-v, --version", "Display version information")
    .helpOption("-h, --help", "Display help information");
/**
 * Load Command - Loads G-NAF data into OpenSearch.
 *
 * Downloads the latest G-NAF dataset from data.gov.au, extracts it,
 * and indexes all addresses into the configured OpenSearch instance.
 */
program
    .command("load")
    .description("Load G-NAF address data into the search index")
    .option("-d, --daemon", "Run in background (daemon) mode", false)
    .option("-s, --states <states>", "Comma-separated list of states to load (e.g., NSW,VIC,QLD)")
    .option("--clear", "Clear existing index before loading", false)
    .option("--geo", "Enable geocoding support", false)
    .action(async (options) => {
    // Set daemon mode based on CLI flag
    (0, terminalUI_1.setDaemonMode)(options.daemon);
    // Set environment variables based on options
    if (options.states) {
        process.env.COVERED_STATES = options.states;
    }
    if (options.clear) {
        process.env.ES_CLEAR_INDEX = "1";
    }
    if (options.geo) {
        process.env.ADDRESSKIT_ENABLE_GEO = "1";
    }
    // Display banner in non-daemon mode
    if (!options.daemon) {
        (0, terminalUI_1.displayBanner)(version_1.version);
    }
    try {
        // Dynamically import the load command to ensure env vars are set
        const { runLoadCommand } = await Promise.resolve().then(() => require("./commands/load"));
        await runLoadCommand(options);
    }
    catch (error) {
        (0, terminalUI_1.logError)("Failed to execute load command", error);
        process.exit(1);
    }
});
/**
 * Start Command - Starts the REST API server.
 *
 * Boots the Express-based REST API server with Swagger/OpenAPI
 * documentation and connects to the OpenSearch index.
 */
program
    .command("start")
    .description("Start the REST API server")
    .option("-d, --daemon", "Run in background (daemon) mode", false)
    .option("-p, --port <port>", "Port to listen on", process.env.PORT || "8080")
    .action(async (options) => {
    // Set daemon mode based on CLI flag
    (0, terminalUI_1.setDaemonMode)(options.daemon);
    // Set port if provided
    if (options.port) {
        process.env.PORT = options.port;
    }
    // Display banner in non-daemon mode
    if (!options.daemon) {
        (0, terminalUI_1.displayBanner)(version_1.version);
    }
    try {
        // Dynamically import the start command to ensure env vars are set
        const { runStartCommand } = await Promise.resolve().then(() => require("./commands/start"));
        await runStartCommand(options);
    }
    catch (error) {
        (0, terminalUI_1.logError)("Failed to execute start command", error);
        process.exit(1);
    }
});
/**
 * Version Command - Displays detailed version information.
 */
program
    .command("version")
    .description("Display detailed version and environment information")
    .action(() => {
    (0, terminalUI_1.displayBanner)(version_1.version);
    console.log(`${terminalUI_1.theme.muted("Node.js:")}     ${process.version}`);
    console.log(`${terminalUI_1.theme.muted("Platform:")}    ${process.platform}`);
    console.log(`${terminalUI_1.theme.muted("Architecture:")} ${process.arch}`);
    console.log(`${terminalUI_1.theme.muted("Environment:")} ${process.env.NODE_ENV || "development"}`);
});
// Show banner and help if no command provided
if (process.argv.length === 2) {
    (0, terminalUI_1.displayBanner)(version_1.version);
    program.outputHelp();
    process.exit(0);
}
/**
 * Parse command line arguments and execute.
 */
program.parse(process.argv);
//# sourceMappingURL=index.js.map