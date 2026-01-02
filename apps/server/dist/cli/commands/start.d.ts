/**
 * Start Command Implementation
 *
 * Handles starting the REST API server with beautiful terminal output,
 * status indicators, and comprehensive configuration display.
 */
import { esConnect } from "@repo/addresskit-client/elasticsearch";
declare global {
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
export declare function runStartCommand(options: StartCommandOptions): Promise<void>;
export {};
//# sourceMappingURL=start.d.ts.map