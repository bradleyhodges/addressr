import * as fs from "node:fs";
import type { IncomingMessage } from "node:http";
import { get } from "node:https";
import * as path from "node:path";
import { parse } from "node:url";

// biome-ignore lint/suspicious/noExplicitAny: progress does not ship types
const ProgressBar: any = require("progress");

/**
 * Downloads a remote file to disk while emitting a console progress bar.
 *
 * @param {string} url - Remote URL to download.
 * @param {string | undefined} destinationPath - Optional destination path; defaults to the URL basename.
 * @param {number | undefined} expectedSize - Optional expected size used when the response omits content-length.
 * @returns {Promise<https.IncomingMessage>} Resolves with the response once the file is fully written.
 */
export default function streamDown(
    url: string,
    destinationPath?: string,
    expectedSize?: number,
): Promise<IncomingMessage> {
    // Parse the URL into a URI object
    const uri = parse(url);

    // Resolve the destination path to a file name
    const resolvedDestination =
        destinationPath ?? path.basename(uri.path ?? url);

    // Create a write stream to the resolved destination
    const file = fs.createWriteStream(resolvedDestination);

    return new Promise((resolve, reject) => {
        // Get the response from the URL
        get(uri.href, (response: IncomingMessage) => {
            // Get the content length header
            const contentLengthHeader = response.headers["content-length"];

            // Calculate the total bytes to download
            const totalBytes =
                contentLengthHeader !== undefined
                    ? Number.parseInt(contentLengthHeader, 10)
                    : (expectedSize ?? 0);

            // Create a progress bar
            const progressBar = new ProgressBar(
                "Downloading G-NAF file... [:bar] :rate/bps (:percent complete) ETA: :etas remaining",
                {
                    complete: "=",
                    incomplete: " ",
                    width: 20,
                    total: totalBytes,
                },
            );

            // Write the data to the file
            response.on("data", (chunk: Buffer) => {
                file.write(chunk);
                progressBar.tick(chunk.length);
            });

            // End the file
            response.on("end", () => {
                file.end();
                console.log(
                    `\n${uri.path} downloaded to: ${resolvedDestination}`,
                );
                resolve(response);
            });

            // Handle errors
            response.on("error", (error: Error) => {
                reject(error);
            });
        });
    });
}
