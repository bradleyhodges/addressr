/**
 * Load Command Implementation
 *
 * Handles the G-NAF data loading process with beautiful terminal output,
 * progress indicators, and comprehensive status reporting.
 */

import { esConnect } from "@repo/addresskit-client/elasticsearch";
import debug from "debug";
import service from "../../service";
import {
    displayBanner,
    displayBox,
    displayKeyValue,
    displaySection,
    failSpinner,
    formatDuration,
    formatState,
    getDaemonMode,
    logDebug,
    logError,
    logInfo,
    logSuccess,
    logWarning,
    startSpinner,
    succeedSpinner,
    theme,
    warnSpinner,
} from "../../service/helpers/terminalUI";

/** Debug logger for API operations */
const logger = debug("api");

/** Debug logger for error operations */
const error = debug("error");

/**
 * Command options for the load command.
 */
interface LoadCommandOptions {
    /** Run in daemon (background) mode */
    daemon: boolean;
    /** Comma-separated list of states to load */
    states?: string;
    /** Clear existing index before loading */
    clear: boolean;
    /** Enable geocoding support */
    geo: boolean;
}

/**
 * Executes the load command with beautiful terminal output.
 *
 * This function orchestrates the entire G-NAF data loading workflow:
 * 1. Connects to OpenSearch
 * 2. Downloads the G-NAF dataset
 * 3. Extracts and parses the data
 * 4. Indexes all addresses
 *
 * @param options - Command options from the CLI.
 * @returns Promise that resolves when loading completes.
 * @throws Error if any step of the loading process fails.
 */
export async function runLoadCommand(
    options: LoadCommandOptions,
): Promise<void> {
    const startTime = Date.now();
    const isDaemon = getDaemonMode();

    // Enable debug loggers if not in daemon mode
    if (!isDaemon && process.env.DEBUG === undefined) {
        debug.enable("api,error");
    }

    // Display configuration section
    if (!isDaemon) {
        displaySection("Configuration");
        displayKeyValue({
            "OpenSearch URL": process.env.ES_HOST || "http://localhost:9200",
            "Index Name": process.env.ES_INDEX_NAME || "addresskit",
            "Clear Index": options.clear ? "Yes" : "No",
            Geocoding: options.geo ? "Enabled" : "Disabled",
            States: options.states || "All",
        });
    }

    // Connect to OpenSearch
    const connectSpinner = startSpinner("Connecting to OpenSearch...");
    try {
        await esConnect();
        succeedSpinner("Connected to OpenSearch");
        logger("es client connected");
    } catch (err) {
        failSpinner("Failed to connect to OpenSearch");
        logError("Connection error", err as Error);
        throw err;
    }

    // Display loading section
    if (!isDaemon) {
        displaySection("Data Loading");
    }

    // Start the data loading process
    const loadSpinner = startSpinner("Initializing G-NAF data loader...");
    try {
        // Override console.log temporarily to capture loader output
        const originalLog = console.log;
        const statesLoaded: string[] = [];

        if (!isDaemon) {
            console.log = (...args: unknown[]) => {
                const message = args.join(" ");

                // Detect state loading messages
                const stateMatch = message.match(
                    /Loading.*?(NSW|VIC|QLD|WA|SA|TAS|ACT|NT|OT)/i,
                );
                if (stateMatch) {
                    const state = stateMatch[1].toUpperCase();
                    if (!statesLoaded.includes(state)) {
                        statesLoaded.push(state);
                        succeedSpinner(
                            `Processing state: ${formatState(state)}`,
                        );
                        startSpinner(
                            `Loading ${formatState(state)} addresses...`,
                        );
                    }
                } else if (message.includes("G-NAF")) {
                    // G-NAF related messages
                    const gSpinner = startSpinner(message);
                    setTimeout(() => succeedSpinner(message), 100);
                } else {
                    // Pass through other messages
                    logger(message);
                }
            };
        }

        // Execute the load command
        await service.load();

        // Restore console.log
        console.log = originalLog;

        succeedSpinner("G-NAF data loaded successfully");
        logger("data loaded");

        // Display completion summary
        const duration = Date.now() - startTime;
        if (!isDaemon) {
            displaySection("Summary");
            displayKeyValue({
                Status: "Completed",
                Duration: formatDuration(duration),
                "States Loaded":
                    statesLoaded.length > 0 ? statesLoaded.join(", ") : "All",
            });

            console.log();
            displayBox(
                `Data loading completed in ${formatDuration(duration)}`,
                "success",
            );
            console.log();
        }

        logSuccess(
            `G-NAF data loading completed in ${formatDuration(duration)}`,
        );
    } catch (err) {
        failSpinner("Failed to load G-NAF data");
        logError("Data loading error", err as Error);
        error("error loading data", err);

        if (!isDaemon) {
            displayBox("Data loading failed. Check logs for details.", "error");
        }

        throw err;
    }
}
