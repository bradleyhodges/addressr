"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddress = getAddress;
exports.getAddresses = getAddresses;
const addresskit_core_1 = require("@repo/addresskit-core");
const debug_1 = require("debug");
const service_1 = require("../service");
/**
 * The logger for the API address controller.
 */
const logger = (0, debug_1.default)("api:addresses");
/**
 * The logger for errors.
 */
const errorLogger = (0, debug_1.default)("error:addresses");
/**
 * Writes a standardized error response to the client.
 * Used for consistent error handling across all address endpoints.
 *
 * @param response - Express response object.
 * @param statusCode - HTTP status code to return.
 * @param message - Human-readable error message.
 * @param errorDetails - Optional error object for logging (not sent to client).
 */
const writeErrorResponse = (response, statusCode, message, errorDetails) => {
    // Log the error details for debugging (not exposed to client)
    if (errorDetails !== undefined) {
        errorLogger(`Error [${statusCode}]: ${message}`, errorDetails);
    }
    // Set response headers and send error payload
    response.setHeader("Content-Type", "application/json");
    response.status(statusCode);
    response.json({ error: message });
};
/**
 * Fetches a single address by its unique G-NAF PID.
 *
 * This endpoint returns the full structured address data including
 * building name, street details, locality, postcode, and optional
 * geocoding information.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
function getAddress(request, response) {
    // Log the incoming request for debugging
    logger("IN getAddress");
    // Extract the address ID from the validated Swagger parameters
    const addressId = request.swagger.params.addressId?.value;
    // Guard against missing address ID (should not occur with proper Swagger validation)
    if (addressId === undefined) {
        writeErrorResponse(response, 400, "Missing required parameter: addressId");
        return;
    }
    // Fetch the address from OpenSearch and handle the response
    const addressPromise = (0, service_1.getAddress)(addressId);
    addressPromise
        .then((addressResponse) => {
        // Handle error responses from the service layer
        if (addressResponse.statusCode !== undefined) {
            // Set content type and return the error response
            response.setHeader("Content-Type", "application/json");
            response.status(addressResponse.statusCode);
            response.json(addressResponse.json);
            return;
        }
        // Handle success responses with HATEOAS links
        if (addressResponse.link !== undefined) {
            response.setHeader("link", addressResponse.link.toString());
        }
        // Write the address data as JSON
        (0, addresskit_core_1.writeJson)(response, addressResponse.json);
    })
        .catch((error) => {
        // Handle unexpected errors from the service layer
        writeErrorResponse(response, 500, "An unexpected error occurred while fetching the address", error);
    });
}
/**
 * Searches for addresses matching a query string with pagination support.
 *
 * This endpoint provides autocomplete/typeahead functionality for address
 * searches. It uses fuzzy matching against the single-line address (SLA)
 * and short single-line address (SSLA) fields.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
function getAddresses(request, response) {
    // Extract search query and page number from validated Swagger parameters
    const q = request.swagger.params.q?.value;
    const p = request.swagger.params.p?.value;
    // Construct the base URL for HATEOAS link generation
    const url = new URL(request.url, `http://localhost:${process.env.PORT ?? "8080"}`);
    // Fetch matching addresses from OpenSearch
    // Cast swagger context as the service expects the path.get structure
    const addressesPromise = (0, service_1.getAddresses)(url.pathname, request.swagger, q, p);
    addressesPromise
        .then((addressesResponse) => {
        // Handle error responses from the service layer
        if (addressesResponse.statusCode !== undefined) {
            response.setHeader("Content-Type", "application/json");
            response.status(addressesResponse.statusCode);
            response.json(addressesResponse.json);
            return;
        }
        // Set HATEOAS Link header for pagination navigation
        if (addressesResponse.link !== undefined) {
            response.setHeader("link", addressesResponse.link.toString());
        }
        // Set Link-Template header for API discoverability (RFC 6570)
        if (addressesResponse.linkTemplate !== undefined) {
            response.setHeader("link-template", addressesResponse.linkTemplate.toString());
        }
        // Write the search results as JSON
        (0, addresskit_core_1.writeJson)(response, addressesResponse.json);
    })
        .catch((error) => {
        // Handle unexpected errors from the service layer
        writeErrorResponse(response, 500, "An unexpected error occurred while searching addresses", error);
    });
}
//# sourceMappingURL=Addresses.js.map