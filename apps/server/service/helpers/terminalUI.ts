/**
 * Terminal UI Helper Module
 *
 * Provides beautiful terminal output using ora spinners and chalk styling
 * for a delightful user experience during CLI operations.
 */

import * as chalk from "chalk";
import * as ora from "ora";

// ---------------------------------------------------------------------------------
// Theme Configuration
// ---------------------------------------------------------------------------------

/**
 * Color palette for consistent terminal styling across the application.
 * Uses a vibrant, modern color scheme with good contrast for readability.
 */
export const theme = {
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
} as const;

// ---------------------------------------------------------------------------------
// ASCII Art & Branding
// ---------------------------------------------------------------------------------

/**
 * ASCII art logo for AddressKit.
 * Displayed at startup for brand recognition.
 */
const LOGO = `
${theme.primary("    ___       __    __                    __ __ _ __ ")}
${theme.primary("   /   | ____/ /___/ /_______  __________/ //_/(_) /_")}
${theme.secondary("  / /| |/ __  / __  / ___/ _ \\/ ___/ ___/ ,<  / / __/")}
${theme.secondary(" / ___ / /_/ / /_/ / /  /  __(__  |__  ) /| |/ / /_  ")}
${theme.primary("/_/  |_\\__,_/\\__,_/_/   \\___/____/____/_/ |_/_/\\__/  ")}
`;

/**
 * Displays the AddressKit logo and version information.
 *
 * @param version - The current version string to display.
 */
export function displayBanner(version?: string): void {
    console.log(LOGO);
    console.log(
        theme.muted("  ─────────────────────────────────────────────────────"),
    );
    console.log(
        `  ${theme.bold("Australian Address Validation & Autocomplete Engine")}`,
    );
    if (version) {
        console.log(`  ${theme.muted(`Version ${version}`)}`);
    }
    console.log(
        theme.muted(
            "  ─────────────────────────────────────────────────────\n",
        ),
    );
}

// ---------------------------------------------------------------------------------
// Spinner Management
// ---------------------------------------------------------------------------------

/** Current active spinner instance for sequential operations */
let currentSpinner: ora.Ora | null = null;

/** Flag indicating whether we're in daemon/silent mode */
let isDaemonMode = false;

/**
 * Sets the daemon mode flag. When enabled, all terminal output is suppressed.
 *
 * @param enabled - Whether daemon mode should be enabled.
 */
export function setDaemonMode(enabled: boolean): void {
    isDaemonMode = enabled;
}

/**
 * Checks if the application is running in daemon mode.
 *
 * @returns True if running in daemon mode, false otherwise.
 */
export function getDaemonMode(): boolean {
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
export function startSpinner(text: string): ora.Ora {
    if (isDaemonMode) {
        // Return a mock spinner for daemon mode
        return {
            start: () => ({}) as ora.Ora,
            stop: () => ({}) as ora.Ora,
            succeed: () => ({}) as ora.Ora,
            fail: () => ({}) as ora.Ora,
            warn: () => ({}) as ora.Ora,
            info: () => ({}) as ora.Ora,
            text: "",
            color: "cyan",
            isSpinning: false,
            // biome-ignore lint/suspicious/noExplicitAny: Mock implementation
        } as any;
    }

    // Stop any existing spinner
    if (currentSpinner?.isSpinning) {
        currentSpinner.stop();
    }

    currentSpinner = ora({
        text: theme.info(text),
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
export function updateSpinner(text: string): void {
    if (isDaemonMode || !currentSpinner) return;
    currentSpinner.text = theme.info(text);
}

/**
 * Marks the current spinner as successful with a completion message.
 *
 * @param text - Optional success message. Uses spinner text if not provided.
 */
export function succeedSpinner(text?: string): void {
    if (isDaemonMode || !currentSpinner) return;
    currentSpinner.succeed(theme.success(text || currentSpinner.text));
    currentSpinner = null;
}

/**
 * Marks the current spinner as failed with an error message.
 *
 * @param text - Optional error message. Uses spinner text if not provided.
 */
export function failSpinner(text?: string): void {
    if (isDaemonMode || !currentSpinner) return;
    currentSpinner.fail(theme.error(text || currentSpinner.text));
    currentSpinner = null;
}

/**
 * Marks the current spinner with a warning message.
 *
 * @param text - Optional warning message. Uses spinner text if not provided.
 */
export function warnSpinner(text?: string): void {
    if (isDaemonMode || !currentSpinner) return;
    currentSpinner.warn(theme.warning(text || currentSpinner.text));
    currentSpinner = null;
}

/**
 * Stops the current spinner with an info message.
 *
 * @param text - Optional info message. Uses spinner text if not provided.
 */
export function infoSpinner(text?: string): void {
    if (isDaemonMode || !currentSpinner) return;
    currentSpinner.info(theme.info(text || currentSpinner.text));
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
export function logSuccess(message: string): void {
    if (isDaemonMode) return;
    console.log(`${theme.success("✔")} ${message}`);
}

/**
 * Logs an error message with an X icon.
 *
 * @param message - The message to log.
 * @param error - Optional error object for stack trace.
 */
export function logError(message: string, error?: Error): void {
    if (isDaemonMode) return;
    console.error(`${theme.error("✖")} ${theme.error(message)}`);
    if (error?.stack) {
        console.error(theme.dim(error.stack));
    }
}

/**
 * Logs a warning message with a warning icon.
 *
 * @param message - The message to log.
 */
export function logWarning(message: string): void {
    if (isDaemonMode) return;
    console.log(`${theme.warning("⚠")} ${theme.warning(message)}`);
}

/**
 * Logs an info message with an info icon.
 *
 * @param message - The message to log.
 */
export function logInfo(message: string): void {
    if (isDaemonMode) return;
    console.log(`${theme.info("ℹ")} ${message}`);
}

/**
 * Logs a debug message (only when not in daemon mode).
 *
 * @param message - The message to log.
 */
export function logDebug(message: string): void {
    if (isDaemonMode) return;
    console.log(`${theme.muted("⋯")} ${theme.muted(message)}`);
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
export function createProgressBar(
    current: number,
    total: number,
    width = 30,
): string {
    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const filledBar = theme.secondary("█".repeat(filled));
    const emptyBar = theme.dim("░".repeat(empty));
    const percentText = theme.bold(`${percentage.toFixed(1)}%`);

    return `${filledBar}${emptyBar} ${percentText}`;
}

/**
 * Formats a number with thousands separators for readability.
 *
 * @param num - The number to format.
 * @returns Formatted number string with commas.
 */
export function formatNumber(num: number): string {
    return num.toLocaleString("en-AU");
}

/**
 * Formats bytes into a human-readable size string.
 *
 * @param bytes - The number of bytes to format.
 * @returns Human-readable size string (e.g., "1.5 GB").
 */
export function formatBytes(bytes: number): string {
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
export function formatDuration(ms: number): string {
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
export function displaySection(title: string): void {
    if (isDaemonMode) return;
    console.log();
    console.log(`${theme.primary("▸")} ${theme.bold(title)}`);
    console.log(theme.muted(`  ${"─".repeat(title.length + 2)}`));
}

/**
 * Displays a styled subsection header.
 *
 * @param title - The subsection title to display.
 */
export function displaySubsection(title: string): void {
    if (isDaemonMode) return;
    console.log(`  ${theme.secondary("›")} ${title}`);
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
export function displayKeyValue(
    data: Record<string, string | number | boolean>,
    indent = 2,
): void {
    if (isDaemonMode) return;

    const padding = " ".repeat(indent);
    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));

    for (const [key, value] of Object.entries(data)) {
        const paddedKey = key.padEnd(maxKeyLength);
        console.log(
            `${padding}${theme.muted(paddedKey)}  ${theme.highlight(String(value))}`,
        );
    }
}

// ---------------------------------------------------------------------------------
// State-Specific Styling
// ---------------------------------------------------------------------------------

/**
 * Australian state color mapping for visual distinction.
 */
const stateColors: Record<string, chalk.Chalk> = {
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
export function getStateColor(state: string): chalk.Chalk {
    return stateColors[state.toUpperCase()] || theme.muted;
}

/**
 * Formats a state name with its distinctive color.
 *
 * @param state - Australian state abbreviation.
 * @returns Colored state string.
 */
export function formatState(state: string): string {
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
export function displayBox(
    message: string,
    type: "info" | "success" | "warning" | "error" = "info",
): void {
    if (isDaemonMode) return;

    const colorMap = {
        info: theme.info,
        success: theme.success,
        warning: theme.warning,
        error: theme.error,
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

// ---------------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------------

export { chalk, ora };
