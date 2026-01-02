/**
 * Start Command Implementation
 *
 * Handles starting the REST API server with beautiful terminal output,
 * status indicators, and comprehensive configuration display.
 */

import { esConnect } from "@repo/addresskit-client/elasticsearch";
import debug from "debug";
import {
    displayBox,
    displayKeyValue,
    displaySection,
    failSpinner,
    getDaemonMode,
    logError,
    logInfo,
    logSuccess,
    startSpinner,
    succeedSpinner,
    theme,
} from "../../service/helpers/terminalUI";
import { startRest2Server } from "../../src/waycharterServer";
import { VERBOSE } from "../../service/config";

/** Debug logger for API operations */
const logger = debug("api");

/** Debug logger for error operations */
const error = debug("error");

// Extend global namespace for ES client
declare global {
    // eslint-disable-next-line no-var
    var esClient: Awaited<ReturnType<typeof esConnect>>;
}

/**
 * Command options for the start command.
 */
interface StartCommandOptions {
    /** Run in daemon (background) mode */
    daemon: boolean;
    /** Port to listen on */
    port: string;
}

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
export async function runStartCommand(
    options: StartCommandOptions,
): Promise<void> {
    const isDaemon = getDaemonMode();
    const port = options.port || process.env.PORT || "8080";

    // Enable debug loggers if not in daemon mode
    if (!isDaemon && process.env.DEBUG === undefined) {
        debug.enable("api,error");
    }

    // Display configuration section
    if (!isDaemon) {
        displaySection("Server Configuration");
        displayKeyValue({
            Port: port,
            Environment: process.env.NODE_ENV || "development",
            "OpenSearch URL": process.env.ES_HOST || "http://localhost:9200",
            "Index Name": process.env.ES_INDEX_NAME || "addresskit",
            "CORS Origin":
                process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN || "*",
        });
    }

    // Start the REST server
    if (!isDaemon) {
        displaySection("Server Startup");
    }

    const serverSpinner = startSpinner("Starting REST API server...");
    try {
        if (VERBOSE) logger("starting REST server");
        await startRest2Server();
        succeedSpinner(
            `REST API server started on port ${theme.highlight(port)}`,
        );
    } catch (err) {
        failSpinner("Failed to start REST API server");
        logError("Server startup error", err as Error);
        throw err;
    }

    // Connect to OpenSearch
    const esSpinner = startSpinner("Connecting to OpenSearch...");
    try {
        if (VERBOSE) logger("connecting es client");
        const esClient = await esConnect();
        global.esClient = esClient;
        succeedSpinner("Connected to OpenSearch");
        if (VERBOSE) logger("es client connected");
    } catch (err) {
        failSpinner("Failed to connect to OpenSearch");
        logError("OpenSearch connection error", err as Error);
        throw err;
    }

    // Display server ready message
    if (!isDaemon) {
        console.log();
        displayBox(`Server is ready at http://localhost:${port}`, "success");
        console.log();

        displaySection("Available Endpoints");
        console.log(
            `  ${theme.secondary("GET")}  ${theme.muted("/addresses?q=<query>")}`,
        );
        console.log(
            `       ${theme.dim("Search for addresses matching the query")}`,
        );
        console.log();
        console.log(
            `  ${theme.secondary("GET")}  ${theme.muted("/addresses/:id")}`,
        );
        console.log(
            `       ${theme.dim("Get detailed information for a specific address")}`,
        );
        console.log();
        console.log(`  ${theme.secondary("GET")}  ${theme.muted("/docs")}`);
        console.log(`       ${theme.dim("OpenAPI/Swagger documentation")}`);
        console.log();

        logInfo(`Press ${theme.highlight("Ctrl+C")} to stop the server`);
    }

    logSuccess(`AddressKit API server running at http://localhost:${port}`);
}
