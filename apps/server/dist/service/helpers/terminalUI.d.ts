/**
 * Terminal UI Helper Module
 *
 * Provides beautiful terminal output using ora spinners and chalk styling
 * for a delightful user experience during CLI operations.
 */
import * as chalk from "chalk";
import * as ora from "ora";
/**
 * Color palette for consistent terminal styling across the application.
 * Uses a vibrant, modern color scheme with good contrast for readability.
 */
export declare const theme: {
    /** Primary brand color - used for main headings and important info */
    readonly primary: chalk.Chalk;
    /** Secondary accent color - used for highlights and emphasis */
    readonly secondary: chalk.Chalk;
    /** Success color - used for completed operations and positive feedback */
    readonly success: chalk.Chalk;
    /** Warning color - used for cautions and non-critical alerts */
    readonly warning: chalk.Chalk;
    /** Error color - used for failures and critical issues */
    readonly error: chalk.Chalk;
    /** Muted color - used for less important information */
    readonly muted: chalk.Chalk;
    /** Info color - used for general information */
    readonly info: chalk.Chalk;
    /** Highlight color - used for key values and emphasis */
    readonly highlight: chalk.Chalk;
    /** Dim text - used for supplementary information */
    readonly dim: chalk.Chalk;
    /** Bold text - used for emphasis */
    readonly bold: chalk.Chalk;
};
/**
 * Displays the AddressKit logo and version information.
 *
 * @param version - The current version string to display.
 */
export declare function displayBanner(version?: string): void;
/**
 * Sets the daemon mode flag. When enabled, all terminal output is suppressed.
 *
 * @param enabled - Whether daemon mode should be enabled.
 */
export declare function setDaemonMode(enabled: boolean): void;
/**
 * Checks if the application is running in daemon mode.
 *
 * @returns True if running in daemon mode, false otherwise.
 */
export declare function getDaemonMode(): boolean;
/**
 * Creates and starts a new spinner with the given message.
 * If in daemon mode, returns a mock spinner that does nothing.
 *
 * @param text - The message to display alongside the spinner.
 * @returns The ora spinner instance.
 */
export declare function startSpinner(text: string): ora.Ora;
/**
 * Updates the current spinner's text.
 *
 * @param text - The new text to display.
 */
export declare function updateSpinner(text: string): void;
/**
 * Marks the current spinner as successful with a completion message.
 *
 * @param text - Optional success message. Uses spinner text if not provided.
 */
export declare function succeedSpinner(text?: string): void;
/**
 * Marks the current spinner as failed with an error message.
 *
 * @param text - Optional error message. Uses spinner text if not provided.
 */
export declare function failSpinner(text?: string): void;
/**
 * Marks the current spinner with a warning message.
 *
 * @param text - Optional warning message. Uses spinner text if not provided.
 */
export declare function warnSpinner(text?: string): void;
/**
 * Stops the current spinner with an info message.
 *
 * @param text - Optional info message. Uses spinner text if not provided.
 */
export declare function infoSpinner(text?: string): void;
/**
 * Logs a success message with a checkmark icon.
 *
 * @param message - The message to log.
 */
export declare function logSuccess(message: string): void;
/**
 * Logs an error message with an X icon.
 *
 * @param message - The message to log.
 * @param error - Optional error object for stack trace.
 */
export declare function logError(message: string, error?: Error): void;
/**
 * Logs a warning message with a warning icon.
 *
 * @param message - The message to log.
 */
export declare function logWarning(message: string): void;
/**
 * Logs an info message with an info icon.
 *
 * @param message - The message to log.
 */
export declare function logInfo(message: string): void;
/**
 * Logs a debug message (only when not in daemon mode).
 *
 * @param message - The message to log.
 */
export declare function logDebug(message: string): void;
/**
 * Creates a visual progress bar string.
 *
 * @param current - Current progress value.
 * @param total - Total value for 100% completion.
 * @param width - Width of the progress bar in characters.
 * @returns Formatted progress bar string.
 */
export declare function createProgressBar(current: number, total: number, width?: number): string;
/**
 * Formats a number with thousands separators for readability.
 *
 * @param num - The number to format.
 * @returns Formatted number string with commas.
 */
export declare function formatNumber(num: number): string;
/**
 * Formats bytes into a human-readable size string.
 *
 * @param bytes - The number of bytes to format.
 * @returns Human-readable size string (e.g., "1.5 GB").
 */
export declare function formatBytes(bytes: number): string;
/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds.
 * @returns Human-readable duration (e.g., "2h 15m 30s").
 */
export declare function formatDuration(ms: number): string;
/**
 * Displays a styled section header for organizing output.
 *
 * @param title - The section title to display.
 */
export declare function displaySection(title: string): void;
/**
 * Displays a styled subsection header.
 *
 * @param title - The subsection title to display.
 */
export declare function displaySubsection(title: string): void;
/**
 * Displays key-value pairs in a formatted table style.
 *
 * @param data - Object containing key-value pairs to display.
 * @param indent - Number of spaces to indent the table.
 */
export declare function displayKeyValue(data: Record<string, string | number | boolean>, indent?: number): void;
/**
 * Returns a chalk function for styling state-specific text.
 *
 * @param state - Australian state abbreviation (e.g., "NSW", "VIC").
 * @returns Chalk function for the state color.
 */
export declare function getStateColor(state: string): chalk.Chalk;
/**
 * Formats a state name with its distinctive color.
 *
 * @param state - Australian state abbreviation.
 * @returns Colored state string.
 */
export declare function formatState(state: string): string;
/**
 * Displays a boxed message for important announcements.
 *
 * @param message - The message to display in the box.
 * @param type - The type of message (affects color).
 */
export declare function displayBox(message: string, type?: "info" | "success" | "warning" | "error"): void;
export { chalk, ora };
//# sourceMappingURL=terminalUI.d.ts.map