"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocality = getLocality;
exports.getLocalities = getLocalities;
const addresskit_core_1 = require("@repo/addresskit-core");
const debug_1 = __importDefault(require("debug"));
const service_1 = require("../service");
const config_1 = require("../service/config");
const jsonapi_1 = require("../service/helpers/jsonapi");
/**
 * The logger for the API locality controller.
 */
const logger = (0, debug_1.default)("api:localities");
/**
 * The logger for errors.
 */
const errorLogger = (0, debug_1.default)("error:localities");
/**
 * Writes a standardized JSON:API error response to the client.
 * Used for consistent error handling across all locality endpoints.
 *
 * @param response - Express response object.
 * @param statusCode - HTTP status code to return.
 * @param message - Human-readable error message.
 * @param errorDetails - Optional error object for logging (not sent to client).
 */
const writeErrorResponse = (response, statusCode, message, errorDetails) => {
    // Log the error details for debugging (not exposed to client)
    if (errorDetails !== undefined) {
        if (config_1.VERBOSE)
            errorLogger(`Error [${statusCode}]: ${message}`, errorDetails);
    }
    // Set response headers and send JSON:API error payload
    response.setHeader("Content-Type", jsonapi_1.JSONAPI_CONTENT_TYPE);
    response.status(statusCode);
    response.json({
        jsonapi: { version: "1.1" },
        errors: [
            {
                status: String(statusCode),
                title: message,
            },
        ],
    });
};
/**
 * Fetches a single locality by its unique G-NAF Locality PID.
 *
 * This endpoint returns the full locality data including
 * name, state, postcodes, and classification.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
function getLocality(request, response) {
    // Log the incoming request for debugging
    if (config_1.VERBOSE)
        logger("IN getLocality");
    // Extract the locality ID from the validated Swagger parameters
    const localityId = request.swagger.params.localityId?.value;
    // Guard against missing locality ID (should not occur with proper Swagger validation)
    if (localityId === undefined) {
        writeErrorResponse(response, 400, "Missing required parameter: localityId");
        return;
    }
    // Fetch the locality from OpenSearch and handle the response
    const localityPromise = (0, service_1.getLocality)(localityId);
    localityPromise
        .then((localityResponse) => {
        // Handle error responses from the service layer (JSON:API error documents)
        if (localityResponse.statusCode !== undefined) {
            // Set JSON:API content type and return the error response
            response.setHeader("Content-Type", jsonapi_1.JSONAPI_CONTENT_TYPE);
            response.status(localityResponse.statusCode);
            response.json(localityResponse.json);
            return;
        }
        // Handle success responses with HATEOAS links
        if (localityResponse.link !== undefined) {
            response.setHeader("link", localityResponse.link.toString());
        }
        // Set JSON:API content type and write the locality data
        response.setHeader("Content-Type", jsonapi_1.JSONAPI_CONTENT_TYPE);
        (0, addresskit_core_1.writeJson)(response, localityResponse.json);
    })
        .catch((error) => {
        // Handle unexpected errors from the service layer
        writeErrorResponse(response, 500, "An unexpected error occurred while fetching the locality", error);
    });
}
/**
 * Searches for localities matching a query string with pagination support.
 *
 * This endpoint provides autocomplete/typeahead functionality for locality
 * searches. It uses fuzzy matching against locality names, postcodes, and
 * state abbreviations.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
function getLocalities(request, response) {
    // Extract search query and page number from validated Swagger parameters
    const q = request.swagger.params.q?.value;
    const p = request.swagger.params.p?.value;
    // Construct the base URL for HATEOAS link generation
    const url = new URL(request.url, `http://localhost:${process.env.PORT ?? "8080"}`);
    // Fetch matching localities from OpenSearch
    // Cast swagger context as the service expects the path.get structure
    const localitiesPromise = (0, service_1.getLocalities)(url.pathname, request.swagger, q, p);
    localitiesPromise
        .then((localitiesResponse) => {
        // Handle error responses from the service layer (JSON:API error documents)
        if (localitiesResponse.statusCode !== undefined) {
            response.setHeader("Content-Type", jsonapi_1.JSONAPI_CONTENT_TYPE);
            response.status(localitiesResponse.statusCode);
            response.json(localitiesResponse.json);
            return;
        }
        // Set HATEOAS Link header for pagination navigation
        if (localitiesResponse.link !== undefined) {
            response.setHeader("link", localitiesResponse.link.toString());
        }
        // Set Link-Template header for API discoverability (RFC 6570)
        if (localitiesResponse.linkTemplate !== undefined) {
            response.setHeader("link-template", localitiesResponse.linkTemplate.toString());
        }
        // Set JSON:API content type and write the search results
        response.setHeader("Content-Type", jsonapi_1.JSONAPI_CONTENT_TYPE);
        (0, addresskit_core_1.writeJson)(response, localitiesResponse.json);
    })
        .catch((error) => {
        // Handle unexpected errors from the service layer
        writeErrorResponse(response, 500, "An unexpected error occurred while searching localities", error);
    });
}
//# sourceMappingURL=Localities.js.map