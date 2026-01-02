"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readFileContents = exports.loadFileCounts = exports.fileExists = exports.countLinesInFile = exports.getFiles = void 0;
const fs = require("node:fs");
const path = require("node:path");
const Papa = require("papaparse");
const config_1 = require("../config");
const index_1 = require("../index");
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
const getFiles = async (currentDir, baseDir) => {
    // Get the directory
    const dir = path.resolve(baseDir, currentDir);
    // Log the directory
    if (config_1.VERBOSE)
        (0, index_1.logger)(`reading ${dir} (${currentDir} in ${baseDir})`);
    // Get the directory entries
    const dirents = await (0, index_1.readdir)(dir, { withFileTypes: true });
    // Get the files
    const files = await Promise.all(
    // Map the directory entries to the files
    dirents.map((dirent) => {
        // Get the result
        const res = `${currentDir}/${dirent.name}`;
        // If the directory entry is a directory, get the files from the directory
        // Otherwise, return the result
        return dirent.isDirectory() ? (0, exports.getFiles)(res, baseDir) : res;
    }));
    // Return the files
    return Array.prototype.concat(...files);
};
exports.getFiles = getFiles;
/**
 * Counts the lines in the given file.
 *
 * @alias countFileLines
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param filePath - The path to the file to count the lines of.
 * @returns {Promise<number>} - A promise that resolves with the number of lines in the file.
 */
const countLinesInFile = (filePath) => {
    return new Promise((resolve, reject) => {
        // Create a read stream from the file
        const readStream = fs.createReadStream(filePath, "utf-8");
        // Initialize the lines and last variables
        let lines = 0;
        let last = undefined;
        // On data, increment the lines by the number of lines in the chunk and set the last variable to the last character in the chunk
        readStream.on("data", (chunk) => {
            lines += chunk.split("\n").length - 1;
            last = chunk[chunk.length - 1];
        });
        // On end, if the last character is not a newline, increment the lines
        readStream.on("end", () => {
            if (last !== "\n")
                ++lines;
            // Resolve the promise with the number of lines
            resolve(lines);
        });
        // On error, reject the promise
        readStream.on("error", (err) => {
            reject(err);
        });
    });
};
exports.countLinesInFile = countLinesInFile;
/**
 * Checks if the given file exists.
 *
 * @alias fileExists
 * @augments loadFromGnaf - This function is part of the data loading functionality of the service
 *
 * @param filePath - The path to the file to check if it exists.
 * @returns {Promise<boolean>} - A promise that resolves with true if the file exists, false otherwise.
 */
const fileExists = async (filePath) => {
    try {
        // Try to access the file
        await index_1.fsp.access(filePath, fs.constants.F_OK);
        // If there is no error, return true
        return true;
    }
    catch (err) {
        // ENOENT (file not found) is expected when checking existence - don't log it
        // Only log unexpected errors (permission issues, etc.)
        if (err instanceof Error && "code" in err && err.code !== "ENOENT") {
            (0, index_1.error)(err);
        }
        return false;
    }
};
exports.fileExists = fileExists;
/**
 * Parses and loads record counts for G-NAF data files from a CSV summary file.
 *
 * @param {string} countsFile - Absolute or relative path to the summary CSV file enumerating all G-NAF constituent files and their record counts.
 *
 * @returns {Promise<Record<string, number>>} - An object (record) where each key is a normalized PSV file path,
 *   and each value is the numeric count of data records for that file, as read from the input CSV.
 * @throws {Error} If the file cannot be read or parsed, or if a row is found with an invalid structure.
 */
const loadFileCounts = async (countsFile) => {
    const filesCounts = {};
    await new Promise((resolve, reject) => {
        Papa.parse(fs.createReadStream(countsFile), {
            header: true,
            skipEmptyLines: true,
            /**
             * For each row in the CSV: extract and format the file name, record its count.
             * Example transformation:
             *   "NSW_STATE.zip" → "NSW_STATE.psv"
             */
            step: (row) => {
                if (row.errors.length > 0) {
                    (0, index_1.error)(`Errors reading '${countsFile}': ${row.errors}`);
                    (0, index_1.error)({ errors: row.errors });
                }
                try {
                    // Some rows may refer to files using Windows or strange archive paths, e.g., "foo\bar\baz.zip"
                    const psvFile = row.data.File.replace(/\\/g, "/").replace(/\.zip$/, ".psv");
                    // Store the associated count (assumed to be parsed as number from CSV via PapaParse header typing)
                    filesCounts[psvFile] = row.data.Count;
                }
                catch (err) {
                    // Any malformed or missing data in a row is a fatal condition for this import
                    reject(err);
                }
            },
            /**
             * Once completed, log for audit and resolve to allow the result to be returned.
             */
            complete: () => {
                if (config_1.VERBOSE)
                    (0, index_1.logger)("GNAF data loaded");
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
    if (config_1.VERBOSE)
        (0, index_1.logger)("filesCounts", filesCounts);
    // Return the files counts
    return filesCounts;
};
exports.loadFileCounts = loadFileCounts;
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
const readFileContents = async (filePath) => {
    // Read the file contents
    const contents = await index_1.fsp.readFile(filePath);
    // Return the file contents (split by newlines and trimmed of whitespace)
    return contents
        .toString()
        .split("\n")
        .map((line) => line.trim());
};
exports.readFileContents = readFileContents;
//# sourceMappingURL=fs.js.map