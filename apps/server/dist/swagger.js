"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerInit = swaggerInit;
exports.startServer = startServer;
exports.stopServer = stopServer;
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const path = require("node:path");
const debug_1 = require("debug");
const express = require("express");
const js_yaml_1 = require("js-yaml");
const swagger_tools_1 = require("swagger-tools");
const config_1 = require("./service/config");
// Create the express app and set the server port
const app = express();
const serverPort = Number.parseInt(process.env.PORT ?? "8080", 10);
/**
 * The logger for the API.
 */
const logger = (0, debug_1.default)("api");
/**
 * The logger for errors.
 */
const error = (0, debug_1.default)("error");
/**
 * Set the error log to the console error.
 */
// eslint-disable-next-line no-console
error.log = console.error.bind(console);
/**
 * The options for the swagger middleware.
 */
const options = {
    swaggerUi: path.join(__dirname, "./api/swagger.json"),
    controllers: path.join(__dirname, "./controllers"),
    useStubs: process.env.NODE_ENV === "development",
};
/**
 * Read the swagger specification file and set the swagger document on the global scope.
 */
const spec = (0, node_fs_1.readFileSync)(path.join(__dirname, "./api/swagger.yaml"), "utf8");
const swaggerDoc_ = (0, js_yaml_1.load)(spec);
global.swaggerDoc = swaggerDoc_;
/**
 * Initializes swagger-tools middleware and attaches standard handlers.
 *
 * @returns {Promise<{ app: Express; middleware: SwaggerMiddleware }>} Express app and middleware.
 */
function swaggerInit() {
    // Initialize the swagger middleware
    return new Promise((resolve) => {
        // biome-ignore lint/suspicious/noExplicitAny: library lacks types
        (0, swagger_tools_1.initializeMiddleware)(swaggerDoc, (middleware) => {
            // Get the metadata middleware
            const metaData = middleware.swaggerMetadata();
            app.use(metaData);
            // Use the validator middleware
            app.use(middleware.swaggerValidator({
                validateResponse: process.env.NODE_ENV === undefined ||
                    process.env.NODE_ENV === "development",
            }));
            // Use the router middleware
            app.use(middleware.swaggerRouter(options));
            // Use the UI middleware
            app.use(middleware.swaggerUi({}));
            // Use the error middleware
            app.use((
            // biome-ignore lint/suspicious/noExplicitAny: upstream middleware signature is untyped
            error_, request, res, next) => {
                // If the error is a failed validation, rehydrate the error
                if (error_.failedValidation) {
                    // Create a new error object with the original error
                    const rehydratedError = { ...error_ };
                    // If the error has an original response, parse the original response
                    if (error_.originalResponse) {
                        rehydratedError.originalResponse = JSON.parse(error_.originalResponse);
                    }
                    // If the error has a message, set the message
                    if (error_.message) {
                        rehydratedError.message = error_.message;
                    }
                    // If the error has results, set the results
                    if (error_.results) {
                        rehydratedError.errors = error_.results.errors;
                        rehydratedError.results = undefined;
                    }
                    // Log the error
                    error("error!!!", error_.message, JSON.stringify(rehydratedError, undefined, 2));
                    // Set the response status and send the rehydrated error
                    res.status(error_.code === "SCHEMA_VALIDATION_FAILED"
                        ? 500
                        : 400).json(rehydratedError);
                }
                else {
                    // If the error is not a failed validation, call the next middleware
                    next();
                }
            });
            // Set the swagger app and middleware on the global scope
            global.swaggerApp = app;
            global.swaggerMiddleware = middleware;
            resolve({ app, middleware });
        });
    });
}
/**
 * The server instance.
 */
let server;
/**
 * Starts the HTTP server with CORS header configuration.
 *
 * @returns {Promise<string>} Base URL once the server is listening.
 */
function startServer() {
    // Use the CORS middleware
    app.use((request, response, next) => {
        // If the ACCESS_CONTROL_ALLOW_ORIGIN environment variable is set, add the Access-Control-Allow-Origin header
        if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN !== undefined) {
            response.append("Access-Control-Allow-Origin", process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN);
        }
        // If the ACCESS_CONTROL_EXPOSE_HEADERS environment variable is set, add the Access-Control-Expose-Headers header
        if (process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS !== undefined) {
            response.append("Access-Control-Expose-Headers", process.env.ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS);
        }
        // If the ACCESS_CONTROL_ALLOW_HEADERS environment variable is set, add the Access-Control-Allow-Headers header
        if (process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS !== undefined) {
            response.append("Access-Control-Allow-Headers", process.env.ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS);
        }
        // Call the next middleware
        next();
    });
    // Initialize the swagger middleware and create the server
    return swaggerInit().then(({ app: swaggerApp }) => {
        // Create the server
        server = (0, node_http_1.createServer)(swaggerApp);
        // Listen on the server port
        server.listen(serverPort, () => {
            // Log the server listening
            if (config_1.VERBOSE)
                logger("📡  AddressKit is listening on port %d ( http://localhost:%d ) ", serverPort, serverPort);
            // Log that the swagger-ui is available
            if (config_1.VERBOSE)
                logger("📑  Swagger-ui is available on http://localhost:%d/docs", serverPort);
        });
        // Return the server URL
        return `http://localhost:${serverPort}`;
    });
}
/**
 * Stops the HTTP server if running.
 */
function stopServer() {
    if (server !== undefined) {
        server.close();
    }
}
//# sourceMappingURL=swagger.js.map