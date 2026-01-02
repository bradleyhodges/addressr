"use strict";
/**
 * Load Command Implementation
 *
 * Handles the G-NAF data loading process with beautiful terminal output,
 * progress indicators, and comprehensive status reporting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLoadCommand = runLoadCommand;
const elasticsearch_1 = require("@repo/addresskit-client/elasticsearch");
const debug_1 = require("debug");
const service_1 = require("../../service");
const terminalUI_1 = require("../../service/helpers/terminalUI");
/** Debug logger for API operations */
const logger = (0, debug_1.default)("api");
/** Debug logger for error operations */
const error = (0, debug_1.default)("error");
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
async function runLoadCommand(options) {
    const startTime = Date.now();
    const isDaemon = (0, terminalUI_1.getDaemonMode)();
    // Enable debug loggers if not in daemon mode
    if (!isDaemon && process.env.DEBUG === undefined) {
        debug_1.default.enable("api,error");
    }
    // Display configuration section
    if (!isDaemon) {
        (0, terminalUI_1.displaySection)("Configuration");
        (0, terminalUI_1.displayKeyValue)({
            "OpenSearch URL": process.env.ES_HOST || "http://localhost:9200",
            "Index Name": process.env.ES_INDEX_NAME || "addresskit",
            "Clear Index": options.clear ? "Yes" : "No",
            Geocoding: options.geo ? "Enabled" : "Disabled",
            States: options.states || "All",
        });
    }
    // Connect to OpenSearch
    const connectSpinner = (0, terminalUI_1.startSpinner)("Connecting to OpenSearch...");
    try {
        await (0, elasticsearch_1.esConnect)();
        (0, terminalUI_1.succeedSpinner)("Connected to OpenSearch");
        logger("es client connected");
    }
    catch (err) {
        (0, terminalUI_1.failSpinner)("Failed to connect to OpenSearch");
        (0, terminalUI_1.logError)("Connection error", err);
        throw err;
    }
    // Display loading section
    if (!isDaemon) {
        (0, terminalUI_1.displaySection)("Data Loading");
    }
    // Start the data loading process
    const loadSpinner = (0, terminalUI_1.startSpinner)("Initializing G-NAF data loader...");
    try {
        // Override console.log temporarily to capture loader output
        const originalLog = console.log;
        const statesLoaded = [];
        if (!isDaemon) {
            console.log = (...args) => {
                const message = args.join(" ");
                // Detect state loading messages
                const stateMatch = message.match(/Loading.*?(NSW|VIC|QLD|WA|SA|TAS|ACT|NT|OT)/i);
                if (stateMatch) {
                    const state = stateMatch[1].toUpperCase();
                    if (!statesLoaded.includes(state)) {
                        statesLoaded.push(state);
                        (0, terminalUI_1.succeedSpinner)(`Processing state: ${(0, terminalUI_1.formatState)(state)}`);
                        (0, terminalUI_1.startSpinner)(`Loading ${(0, terminalUI_1.formatState)(state)} addresses...`);
                    }
                }
                else if (message.includes("G-NAF")) {
                    // G-NAF related messages
                    const gSpinner = (0, terminalUI_1.startSpinner)(message);
                    setTimeout(() => (0, terminalUI_1.succeedSpinner)(message), 100);
                }
                else {
                    // Pass through other messages
                    logger(message);
                }
            };
        }
        // Execute the load command
        await service_1.default.load();
        // Restore console.log
        console.log = originalLog;
        (0, terminalUI_1.succeedSpinner)("G-NAF data loaded successfully");
        logger("data loaded");
        // Display completion summary
        const duration = Date.now() - startTime;
        if (!isDaemon) {
            (0, terminalUI_1.displaySection)("Summary");
            (0, terminalUI_1.displayKeyValue)({
                Status: "Completed",
                Duration: (0, terminalUI_1.formatDuration)(duration),
                "States Loaded": statesLoaded.length > 0 ? statesLoaded.join(", ") : "All",
            });
            console.log();
            (0, terminalUI_1.displayBox)(`Data loading completed in ${(0, terminalUI_1.formatDuration)(duration)}`, "success");
            console.log();
        }
        (0, terminalUI_1.logSuccess)(`G-NAF data loading completed in ${(0, terminalUI_1.formatDuration)(duration)}`);
    }
    catch (err) {
        (0, terminalUI_1.failSpinner)("Failed to load G-NAF data");
        (0, terminalUI_1.logError)("Data loading error", err);
        error("error loading data", err);
        if (!isDaemon) {
            (0, terminalUI_1.displayBox)("Data loading failed. Check logs for details.", "error");
        }
        throw err;
    }
}
//# sourceMappingURL=load.js.map