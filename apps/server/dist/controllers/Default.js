"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiRoot = getApiRoot;
const addresskit_core_1 = require("@repo/addresskit-core");
const debug_1 = require("debug");
const DefaultService_1 = require("../service/DefaultService");
/**
 * The logger for error handling.
 */
const errorLogger = (0, debug_1.default)("error:default");
/**
 * Returns API root link relations as Link headers.
 *
 * This endpoint provides HATEOAS entry point for API discoverability,
 * returning available API operations and documentation links in the
 * Link and Link-Template response headers.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param res - Express response.
 */
function getApiRoot(request, res) {
    // Fetch the API root link relations from the service
    (0, DefaultService_1.getApiRoot)()
        .then((response) => {
        // Set HATEOAS Link header for available resources
        res.setHeader("link", response.link.toString());
        // Set Link-Template header for templated URI discovery (RFC 6570)
        res.setHeader("link-template", response.linkTemplate.toString());
        // Write the (empty) response body
        (0, addresskit_core_1.writeJson)(res, response.body);
    })
        .catch((error) => {
        // Log the error for debugging
        errorLogger("Error fetching API root", error);
        // Return a standardized error response
        res.setHeader("Content-Type", "application/json");
        res.status(500);
        res.json({ error: "An unexpected error occurred" });
    });
}
//# sourceMappingURL=Default.js.map