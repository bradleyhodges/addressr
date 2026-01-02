"use strict";
/**
 * Terminal UI Helper Module
 *
 * Provides beautiful terminal output using ora spinners and chalk styling
 * for a delightful user experience during CLI operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ora = exports.chalk = exports.theme = void 0;
exports.displayBanner = displayBanner;
exports.setDaemonMode = setDaemonMode;
exports.getDaemonMode = getDaemonMode;
exports.startSpinner = startSpinner;
exports.updateSpinner = updateSpinner;
exports.succeedSpinner = succeedSpinner;
exports.failSpinner = failSpinner;
exports.warnSpinner = warnSpinner;
exports.infoSpinner = infoSpinner;
exports.logSuccess = logSuccess;
exports.logError = logError;
exports.logWarning = logWarning;
exports.logInfo = logInfo;
exports.logDebug = logDebug;
exports.createProgressBar = createProgressBar;
exports.formatNumber = formatNumber;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
exports.displaySection = displaySection;
exports.displaySubsection = displaySubsection;
exports.displayKeyValue = displayKeyValue;
exports.getStateColor = getStateColor;
exports.formatState = formatState;
exports.displayBox = displayBox;
const chalk = require("chalk");
exports.chalk = chalk;
const ora = require("ora");
exports.ora = ora;
// ---------------------------------------------------------------------------------
// Theme Configuration
// ---------------------------------------------------------------------------------
/**
 * Color palette for consistent terminal styling across the application.
 * Uses a vibrant, modern color scheme with good contrast for readability.
 */
exports.theme = {
    /** Primary brand color - used for main headings and important info */
    primary: chalk.hex("#7C3AED"),
    /** Secondary accent color - used for highlights and emphasis */
    secondary: chalk.hex("#06B6D4"),
    /** Success color - used for completed operations and positive feedback */
    success: chalk.hex("#10B981"),
    /** Warning color - used for cautions and non-critical alerts */
    warning: chalk.hex("#F59E0B"),
    /** Error color - used for failures and critical issues */
    error: chalk.hex("#EF4444"),
    /** Muted color - used for less important information */
    muted: chalk.hex("#6B7280"),
    /** Info color - used for general information */
    info: chalk.hex("#3B82F6"),
    /** Highlight color - used for key values and emphasis */
    highlight: chalk.hex("#EC4899"),
    /** Dim text - used for supplementary information */
    dim: chalk.dim,
    /** Bold text - used for emphasis */
    bold: chalk.bold,
};
// ---------------------------------------------------------------------------------
// ASCII Art & Branding
// ---------------------------------------------------------------------------------
/**
 * ASCII art logo for AddressKit.
 * Displayed at startup for brand recognition.
 */
const LOGO = `
${exports.theme.primary("    ___       __    __                    __ __ _ __ ")}
${exports.theme.primary("   /   | ____/ /___/ /_______  __________/ //_/(_) /_")}
${exports.theme.secondary("  / /| |/ __  / __  / ___/ _ \\/ ___/ ___/ ,<  / / __/")}
${exports.theme.secondary(" / ___ / /_/ / /_/ / /  /  __(__  |__  ) /| |/ / /_  ")}
${exports.theme.primary("/_/  |_\\__,_/\\__,_/_/   \\___/____/____/_/ |_/_/\\__/  ")}
`;
/**
 * Displays the AddressKit logo and version information.
 *
 * @param version - The current version string to display.
 */
function displayBanner(version) {
    console.log(LOGO);
    console.log(exports.theme.muted("  ─────────────────────────────────────────────────────"));
    console.log(`  ${exports.theme.bold("Australian Address Validation & Autocomplete Engine")}`);
    if (version) {
        console.log(`  ${exports.theme.muted(`Version ${version}`)}`);
    }
    console.log(exports.theme.muted("  ─────────────────────────────────────────────────────\n"));
}
// ---------------------------------------------------------------------------------
// Spinner Management
// ---------------------------------------------------------------------------------
/** Current active spinner instance for sequential operations */
let currentSpinner = null;
/** Flag indicating whether we're in daemon/silent mode */
let isDaemonMode = false;
/**
 * Sets the daemon mode flag. When enabled, all terminal output is suppressed.
 *
 * @param enabled - Whether daemon mode should be enabled.
 */
function setDaemonMode(enabled) {
    isDaemonMode = enabled;
}
/**
 * Checks if the application is running in daemon mode.
 *
 * @returns True if running in daemon mode, false otherwise.
 */
function getDaemonMode() {
    return isDaemonMode;
}
/**
 * Custom spinner frames for a unique visual style.
 */
const spinnerFrames = ["◐", "◓", "◑", "◒"];
/**
 * Creates and starts a new spinner with the given message.
 * If in daemon mode, returns a mock spinner that does nothing.
 *
 * @param text - The message to display alongside the spinner.
 * @returns The ora spinner instance.
 */
function startSpinner(text) {
    if (isDaemonMode) {
        // Return a mock spinner for daemon mode
        return {
            start: () => ({}),
            stop: () => ({}),
            succeed: () => ({}),
            fail: () => ({}),
            warn: () => ({}),
            info: () => ({}),
            text: "",
            color: "cyan",
            isSpinning: false,
            // biome-ignore lint/suspicious/noExplicitAny: Mock implementation
        };
    }
    // Stop any existing spinner
    if (currentSpinner?.isSpinning) {
        currentSpinner.stop();
    }
    currentSpinner = ora({
        text: exports.theme.info(text),
        spinner: {
            interval: 80,
            frames: spinnerFrames,
        },
        color: "cyan",
    }).start();
    return currentSpinner;
}
/**
 * Updates the current spinner's text.
 *
 * @param text - The new text to display.
 */
function updateSpinner(text) {
    if (isDaemonMode || !currentSpinner)
        return;
    currentSpinner.text = exports.theme.info(text);
}
/**
 * Marks the current spinner as successful with a completion message.
 *
 * @param text - Optional success message. Uses spinner text if not provided.
 */
function succeedSpinner(text) {
    if (isDaemonMode || !currentSpinner)
        return;
    currentSpinner.succeed(exports.theme.success(text || currentSpinner.text));
    currentSpinner = null;
}
/**
 * Marks the current spinner as failed with an error message.
 *
 * @param text - Optional error message. Uses spinner text if not provided.
 */
function failSpinner(text) {
    if (isDaemonMode || !currentSpinner)
        return;
    currentSpinner.fail(exports.theme.error(text || currentSpinner.text));
    currentSpinner = null;
}
/**
 * Marks the current spinner with a warning message.
 *
 * @param text - Optional warning message. Uses spinner text if not provided.
 */
function warnSpinner(text) {
    if (isDaemonMode || !currentSpinner)
        return;
    currentSpinner.warn(exports.theme.warning(text || currentSpinner.text));
    currentSpinner = null;
}
/**
 * Stops the current spinner with an info message.
 *
 * @param text - Optional info message. Uses spinner text if not provided.
 */
function infoSpinner(text) {
    if (isDaemonMode || !currentSpinner)
        return;
    currentSpinner.info(exports.theme.info(text || currentSpinner.text));
    currentSpinner = null;
}
// ---------------------------------------------------------------------------------
// Logging Functions
// ---------------------------------------------------------------------------------
/**
 * Logs a success message with a checkmark icon.
 *
 * @param message - The message to log.
 */
function logSuccess(message) {
    if (isDaemonMode)
        return;
    console.log(`${exports.theme.success("✔")} ${message}`);
}
/**
 * Logs an error message with an X icon.
 *
 * @param message - The message to log.
 * @param error - Optional error object for stack trace.
 */
function logError(message, error) {
    if (isDaemonMode)
        return;
    console.error(`${exports.theme.error("✖")} ${exports.theme.error(message)}`);
    if (error?.stack) {
        console.error(exports.theme.dim(error.stack));
    }
}
/**
 * Logs a warning message with a warning icon.
 *
 * @param message - The message to log.
 */
function logWarning(message) {
    if (isDaemonMode)
        return;
    console.log(`${exports.theme.warning("⚠")} ${exports.theme.warning(message)}`);
}
/**
 * Logs an info message with an info icon.
 *
 * @param message - The message to log.
 */
function logInfo(message) {
    if (isDaemonMode)
        return;
    console.log(`${exports.theme.info("ℹ")} ${message}`);
}
/**
 * Logs a debug message (only when not in daemon mode).
 *
 * @param message - The message to log.
 */
function logDebug(message) {
    if (isDaemonMode)
        return;
    console.log(`${exports.theme.muted("⋯")} ${exports.theme.muted(message)}`);
}
// ---------------------------------------------------------------------------------
// Progress Indicators
// ---------------------------------------------------------------------------------
/**
 * Creates a visual progress bar string.
 *
 * @param current - Current progress value.
 * @param total - Total value for 100% completion.
 * @param width - Width of the progress bar in characters.
 * @returns Formatted progress bar string.
 */
function createProgressBar(current, total, width = 30) {
    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const filledBar = exports.theme.secondary("█".repeat(filled));
    const emptyBar = exports.theme.dim("░".repeat(empty));
    const percentText = exports.theme.bold(`${percentage.toFixed(1)}%`);
    return `${filledBar}${emptyBar} ${percentText}`;
}
/**
 * Formats a number with thousands separators for readability.
 *
 * @param num - The number to format.
 * @returns Formatted number string with commas.
 */
function formatNumber(num) {
    return num.toLocaleString("en-AU");
}
/**
 * Formats bytes into a human-readable size string.
 *
 * @param bytes - The number of bytes to format.
 * @returns Human-readable size string (e.g., "1.5 GB").
 */
function formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}
/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds.
 * @returns Human-readable duration (e.g., "2h 15m 30s").
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}
// ---------------------------------------------------------------------------------
// Section Headers
// ---------------------------------------------------------------------------------
/**
 * Displays a styled section header for organizing output.
 *
 * @param title - The section title to display.
 */
function displaySection(title) {
    if (isDaemonMode)
        return;
    console.log();
    console.log(`${exports.theme.primary("▸")} ${exports.theme.bold(title)}`);
    console.log(exports.theme.muted(`  ${"─".repeat(title.length + 2)}`));
}
/**
 * Displays a styled subsection header.
 *
 * @param title - The subsection title to display.
 */
function displaySubsection(title) {
    if (isDaemonMode)
        return;
    console.log(`  ${exports.theme.secondary("›")} ${title}`);
}
// ---------------------------------------------------------------------------------
// Status Tables
// ---------------------------------------------------------------------------------
/**
 * Displays key-value pairs in a formatted table style.
 *
 * @param data - Object containing key-value pairs to display.
 * @param indent - Number of spaces to indent the table.
 */
function displayKeyValue(data, indent = 2) {
    if (isDaemonMode)
        return;
    const padding = " ".repeat(indent);
    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));
    for (const [key, value] of Object.entries(data)) {
        const paddedKey = key.padEnd(maxKeyLength);
        console.log(`${padding}${exports.theme.muted(paddedKey)}  ${exports.theme.highlight(String(value))}`);
    }
}
// ---------------------------------------------------------------------------------
// State-Specific Styling
// ---------------------------------------------------------------------------------
/**
 * Australian state color mapping for visual distinction.
 */
const stateColors = {
    NSW: chalk.hex("#00A4E4"),
    VIC: chalk.hex("#003DA5"),
    QLD: chalk.hex("#8B0000"),
    WA: chalk.hex("#FFD100"),
    SA: chalk.hex("#DC143C"),
    TAS: chalk.hex("#005F45"),
    ACT: chalk.hex("#003366"),
    NT: chalk.hex("#8B4513"),
    OT: chalk.hex("#808080"),
};
/**
 * Returns a chalk function for styling state-specific text.
 *
 * @param state - Australian state abbreviation (e.g., "NSW", "VIC").
 * @returns Chalk function for the state color.
 */
function getStateColor(state) {
    return stateColors[state.toUpperCase()] || exports.theme.muted;
}
/**
 * Formats a state name with its distinctive color.
 *
 * @param state - Australian state abbreviation.
 * @returns Colored state string.
 */
function formatState(state) {
    const color = getStateColor(state);
    return color.bold(state);
}
// ---------------------------------------------------------------------------------
// Box Drawing
// ---------------------------------------------------------------------------------
/**
 * Displays a boxed message for important announcements.
 *
 * @param message - The message to display in the box.
 * @param type - The type of message (affects color).
 */
function displayBox(message, type = "info") {
    if (isDaemonMode)
        return;
    const colorMap = {
        info: exports.theme.info,
        success: exports.theme.success,
        warning: exports.theme.warning,
        error: exports.theme.error,
    };
    const color = colorMap[type];
    const border = color("─".repeat(message.length + 4));
    const corner = color("┌");
    const cornerEnd = color("┐");
    const cornerBottomStart = color("└");
    const cornerBottomEnd = color("┘");
    const side = color("│");
    console.log(`${corner}${border}${cornerEnd}`);
    console.log(`${side}  ${message}  ${side}`);
    console.log(`${cornerBottomStart}${border}${cornerBottomEnd}`);
}
//# sourceMappingURL=terminalUI.js.map