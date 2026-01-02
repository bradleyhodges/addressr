"use strict";
/**
 * Start Command Implementation
 *
 * Handles starting the REST API server with beautiful terminal output,
 * status indicators, and comprehensive configuration display.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartCommand = runStartCommand;
const elasticsearch_1 = require("@repo/addresskit-client/elasticsearch");
const debug_1 = require("debug");
const terminalUI_1 = require("../../service/helpers/terminalUI");
const waycharterServer_1 = require("../../src/waycharterServer");
/** Debug logger for API operations */
const logger = (0, debug_1.default)("api");
/** Debug logger for error operations */
const error = (0, debug_1.default)("error");
/**
 * Executes the start command with beautiful terminal output.
 *
 * This function boots the REST API server:
 * 1. Displays configuration
 * 2. Starts the Express server
 * 3. Connects to OpenSearch
 * 4. Reports server status
 *
 * @param options - Command options from the CLI.
 * @returns Promise that resolves when the server is running.
 * @throws Error if the server fails to start.
 */
async function runStartCommand(options) {
    const isDaemon = (0, terminalUI_1.getDaemonMode)();
    const port = options.port || process.env.PORT || "8080";
    // Enable debug loggers if not in daemon mode
    if (!isDaemon && process.env.DEBUG === undefined) {
        debug_1.default.enable("api,error");
    }
    // Display configuration section
    if (!isDaemon) {
        (0, terminalUI_1.displaySection)("Server Configuration");
        (0, terminalUI_1.displayKeyValue)({
            Port: port,
            Environment: process.env.NODE_ENV || "development",
            "OpenSearch URL": process.env.ES_HOST || "http://localhost:9200",
            "Index Name": process.env.ES_INDEX_NAME || "addresskit",
            "CORS Origin": process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN || "*",
        });
    }
    // Start the REST server
    if (!isDaemon) {
        (0, terminalUI_1.displaySection)("Server Startup");
    }
    const serverSpinner = (0, terminalUI_1.startSpinner)("Starting REST API server...");
    try {
        logger("starting REST server");
        await (0, waycharterServer_1.startRest2Server)();
        (0, terminalUI_1.succeedSpinner)(`REST API server started on port ${terminalUI_1.theme.highlight(port)}`);
    }
    catch (err) {
        (0, terminalUI_1.failSpinner)("Failed to start REST API server");
        (0, terminalUI_1.logError)("Server startup error", err);
        throw err;
    }
    // Connect to OpenSearch
    const esSpinner = (0, terminalUI_1.startSpinner)("Connecting to OpenSearch...");
    try {
        logger("connecting es client");
        const esClient = await (0, elasticsearch_1.esConnect)();
        global.esClient = esClient;
        (0, terminalUI_1.succeedSpinner)("Connected to OpenSearch");
        logger("es client connected");
    }
    catch (err) {
        (0, terminalUI_1.failSpinner)("Failed to connect to OpenSearch");
        (0, terminalUI_1.logError)("OpenSearch connection error", err);
        throw err;
    }
    // Display server ready message
    if (!isDaemon) {
        console.log();
        (0, terminalUI_1.displayBox)(`Server is ready at http://localhost:${port}`, "success");
        console.log();
        (0, terminalUI_1.displaySection)("Available Endpoints");
        console.log(`  ${terminalUI_1.theme.secondary("GET")}  ${terminalUI_1.theme.muted("/addresses?q=<query>")}`);
        console.log(`       ${terminalUI_1.theme.dim("Search for addresses matching the query")}`);
        console.log();
        console.log(`  ${terminalUI_1.theme.secondary("GET")}  ${terminalUI_1.theme.muted("/addresses/:id")}`);
        console.log(`       ${terminalUI_1.theme.dim("Get detailed information for a specific address")}`);
        console.log();
        console.log(`  ${terminalUI_1.theme.secondary("GET")}  ${terminalUI_1.theme.muted("/docs")}`);
        console.log(`       ${terminalUI_1.theme.dim("OpenAPI/Swagger documentation")}`);
        console.log();
        (0, terminalUI_1.logInfo)(`Press ${terminalUI_1.theme.highlight("Ctrl+C")} to stop the server`);
    }
    (0, terminalUI_1.logSuccess)(`AddressKit API server running at http://localhost:${port}`);
}
//# sourceMappingURL=start.js.map