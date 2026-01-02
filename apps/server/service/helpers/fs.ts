import * as fs from "node:fs";
import * as path from "node:path";
import * as Papa from "papaparse";
import { error, fsp, logger, readdir } from "../index";
import { VERBOSE } from "../config";

/**
 * Gets the files from the given directory.
 *
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param currentDir - The current directory.
 * @param baseDir - The base directory.
 *
 * @returns {Promise<string[]>} - A promise that resolves with the files from the given directory.
 */
export const getFiles = async (
    currentDir: string,
    baseDir: string,
): Promise<string[]> => {
    // Get the directory
    const dir = path.resolve(baseDir, currentDir);

    // Log the directory
    if (VERBOSE) logger(`reading ${dir} (${currentDir} in ${baseDir})`);

    // Get the directory entries
    const dirents = await readdir(dir, { withFileTypes: true });

    // Get the files
    const files = await Promise.all(
        // Map the directory entries to the files
        dirents.map((dirent: fs.Dirent) => {
            // Get the result
            const res = `${currentDir}/${dirent.name}`;

            // If the directory entry is a directory, get the files from the directory
            // Otherwise, return the result
            return dirent.isDirectory() ? getFiles(res, baseDir) : res;
        }),
    );

    // Return the files
    return Array.prototype.concat(...files);
};

/**
 * Counts the lines in the given file.
 *
 * @alias countFileLines
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param filePath - The path to the file to count the lines of.
 * @returns {Promise<number>} - A promise that resolves with the number of lines in the file.
 */
export const countLinesInFile = (filePath: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        // Create a read stream from the file
        const readStream = fs.createReadStream(filePath, "utf-8");

        // Initialize the lines and last variables
        let lines = 0;
        let last: string | undefined = undefined;

        // On data, increment the lines by the number of lines in the chunk and set the last variable to the last character in the chunk
        readStream.on("data", (chunk) => {
            lines += (chunk as string).split("\n").length - 1;
            last = (chunk as string)[(chunk as string).length - 1];
        });

        // On end, if the last character is not a newline, increment the lines
        readStream.on("end", () => {
            if (last !== "\n") ++lines;

            // Resolve the promise with the number of lines
            resolve(lines);
        });

        // On error, reject the promise
        readStream.on("error", (err) => {
            reject(err);
        });
    });
};

/**
 * Checks if the given file exists.
 *
 * @alias fileExists
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param filePath - The path to the file to check if it exists.
 * @returns {Promise<boolean>} - A promise that resolves with true if the file exists, false otherwise.
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
    try {
        // Try to access the file
        await fsp.access(filePath, fs.constants.F_OK);

        // If there is no error, return true
        return true;
    } catch (err) {
        // If there is an error, log the error and return false
        error(err);
        return false;
    }
};

/**
 * Parses and loads record counts for G-NAF data files from a CSV summary file.
 *
 * @param {string} countsFile - Absolute or relative path to the summary CSV file enumerating all G-NAF constituent files and their record counts.
 *
 * @returns {Promise<Record<string, number>>} - An object (record) where each key is a normalized PSV file path,
 *   and each value is the numeric count of data records for that file, as read from the input CSV.
 * @throws {Error} If the file cannot be read or parsed, or if a row is found with an invalid structure.
 */
export const loadFileCounts = async (
    countsFile: string,
): Promise<Record<string, number>> => {
    const filesCounts: Record<string, number> = {};

    await new Promise<void>((resolve, reject) => {
        Papa.parse(fs.createReadStream(countsFile), {
            header: true,
            skipEmptyLines: true,
            /**
             * For each row in the CSV: extract and format the file name, record its count.
             * Example transformation:
             *   "NSW_STATE.zip" → "NSW_STATE.psv"
             */
            step: (row: Papa.ParseResult<{ File: string; Count: number }>) => {
                if (row.errors.length > 0) {
                    error(`Errors reading '${countsFile}': ${row.errors}`);
                    error({ errors: row.errors });
                }
                try {
                    // Some rows may refer to files using Windows or strange archive paths, e.g., "foo\bar\baz.zip"
                    const psvFile = (
                        row.data as unknown as { File: string }
                    ).File.replace(/\\/g, "/").replace(/\.zip$/, ".psv");

                    // Store the associated count (assumed to be parsed as number from CSV via PapaParse header typing)
                    filesCounts[psvFile] = (
                        row.data as unknown as { Count: number }
                    ).Count;
                } catch (err) {
                    // Any malformed or missing data in a row is a fatal condition for this import
                    reject(err);
                }
            },
            /**
             * Once completed, log for audit and resolve to allow the result to be returned.
             */
            complete: () => {
                if (VERBOSE) logger("GNAF data loaded");
                resolve();
            },
            /**
             * Root-level fatal parse errors (e.g., file not found, corrupt).
             */
            error: (err, file) => {
                console.log(err, file);
                reject(err);
            },
        });
    });

    // Log the files counts
    if (VERBOSE) logger("filesCounts", filesCounts);

    // Return the files counts
    return filesCounts;
};

/**
 * Loads the file contents from the given file.
 *
 * @alias loadFileContents
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param filePath - The path to the file to load the contents from.
 *
 * @returns {Promise<string[]>} - A promise that resolves with the file contents.
 */
export const readFileContents = async (filePath: string): Promise<string[]> => {
    // Read the file contents
    const contents = await fsp.readFile(filePath);

    // Return the file contents (split by newlines and trimmed of whitespace)
    return contents
        .toString()
        .split("\n")
        .map((line) => line.trim());
};
