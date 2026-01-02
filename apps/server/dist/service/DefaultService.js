"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiRoot = getApiRoot;
const debug_1 = require("debug");
const LinkHeader = require("http-link-header");
const setLinkOptions_1 = require("./setLinkOptions");
/**
 * The logger for the API root service.
 */
const logger = (0, debug_1.default)("api:root");
/**
 * Type guard to check if the global swaggerDoc is available.
 *
 * @returns True if swaggerDoc is defined and has paths.
 */
const isSwaggerDocAvailable = () => {
    return (global.swaggerDoc !== undefined &&
        global.swaggerDoc.paths !== undefined &&
        typeof global.swaggerDoc.paths === "object");
};
/**
 * Returns API root link relations as Link headers.
 *
 * This endpoint provides the HATEOAS entry point for API discoverability,
 * returning available API operations and documentation links in the
 * Link and Link-Template response headers. Clients can use these links
 * to navigate the API without hardcoding URLs.
 *
 * @returns A promise resolving to the API root response with HATEOAS links.
 * @throws {Error} If the Swagger document is not available.
 */
async function getApiRoot() {
    // Verify Swagger document is loaded before proceeding
    if (!isSwaggerDocAvailable()) {
        logger("Swagger document not available");
        throw new Error("API documentation not loaded");
    }
    // Get paths that have GET operations with x-root-rel defined
    const paths = Object.keys(global.swaggerDoc.paths).filter((p) => {
        const pathDef = global.swaggerDoc.paths[p];
        return (pathDef.get !== undefined && pathDef.get["x-root-rel"] !== undefined);
    });
    // Create a new link header for resource links
    const link = new LinkHeader();
    // Loop through the paths and add links for those without required parameters
    for (const p of paths) {
        const op = global.swaggerDoc.paths[p]
            .get;
        // Skip operations that have required parameters (they need templates instead)
        const hasRequiredParams = op.parameters?.some((parameter) => parameter.required === true);
        if (!hasRequiredParams) {
            // Add direct link for operations without required parameters
            link.set({
                rel: op["x-root-rel"],
                uri: p,
                // Only include title if summary is defined
                ...(op.summary !== undefined && { title: op.summary }),
            });
        }
    }
    // Add link to HTML documentation (Swagger UI)
    link.set({
        rel: "describedby",
        uri: "/docs/",
        title: "API Docs",
        type: "text/html",
    });
    // Add link to JSON documentation (OpenAPI spec)
    link.set({
        rel: "describedby",
        uri: "/api-docs",
        title: "API Docs",
        type: "application/json",
    });
    // Create a new link template header for templated URIs (RFC 6570)
    const linkTemplate = new LinkHeader();
    // Loop through the paths and add templated links for each operation
    for (const url of paths) {
        const op = global.swaggerDoc.paths[url]
            .get;
        // Log the operation for debugging
        logger("Adding link template for:", op.operationId);
        // Set the link options (adds templated URI with query parameters)
        (0, setLinkOptions_1.setLinkOptions)(op, url, linkTemplate);
    }
    // Return the response with empty body (all data is in headers)
    return { link, body: {}, linkTemplate };
}
//# sourceMappingURL=DefaultService.js.map