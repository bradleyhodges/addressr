/**
 * Load Command Implementation
 *
 * Handles the G-NAF data loading process with beautiful terminal output,
 * progress indicators, and comprehensive status reporting.
 */
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
export declare function runLoadCommand(options: LoadCommandOptions): Promise<void>;
export {};
//# sourceMappingURL=load.d.ts.map