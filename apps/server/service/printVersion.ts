import { version } from "@repo/addresskit-core/version";
import * as dotenv from "dotenv";

/**
 * Load the environment variables
 */
dotenv.config();

/**
 * Prints version and environment metadata to stdout.
 */
export function printVersion(): void {
    // Get the environment from the process environment variables
    let environment = process.env.NODE_ENV || "development";

    // If the environment is development, add a message to the environment
    if (environment === "development")
        environment = `${environment}|(set NODE_ENV to 'production' in production environments)`;

    // Get the port from the process environment variables
    const port = process.env.PORT || 8080;

    // Print the version, environment, and port
    console.log(`Version: ${version}`);
    console.log(`NODE_ENV: ${environment}`);
    console.log(`PORT: ${port}`);
}
