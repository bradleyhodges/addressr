import { writeJson } from "@repo/addresskit-core";
import debug from "debug";
import type { Request, Response } from "express";
import {
    getLocalities as fetchLocalities,
    getLocality as fetchLocality,
} from "../service";
import { VERBOSE } from "../service/config";
import { JSONAPI_CONTENT_TYPE } from "../service/helpers/jsonapi";

/**
 * Structured response from locality service functions.
 * May contain either success data (link, json) or error data (statusCode, json).
 */
type LocalityResponse = {
    /** HTTP status code for error responses */
    statusCode?: number;
    /** Response body payload */
    json: unknown;
    /** HATEOAS Link header for navigation */
    link?: { toString(): string };
    /** Link-Template header for API discoverability */
    linkTemplate?: { toString(): string };
};

/**
 * Extended Express Request with Swagger-tools augmentation.
 * Swagger-tools middleware attaches parsed parameters and metadata.
 */
type SwaggerRequest = Request & {
    swagger: {
        /** Parsed and validated request parameters */
        params: {
            localityId?: { value: string };
            q?: { value: string | undefined };
            p?: { value: number | undefined };
        };
        /** Swagger path definition for the matched route */
        path?: {
            get?: {
                operationId?: string;
                "x-swagger-router-controller"?: string;
                "x-root-rel"?: string;
                summary?: string;
                parameters?: Array<{
                    name: string;
                    in: string;
                    required?: boolean;
                }>;
            };
        };
    };
};

/**
 * The logger for the API locality controller.
 */
const logger = debug("api:localities");

/**
 * The logger for errors.
 */
const errorLogger = debug("error:localities");

/**
 * Writes a standardized JSON:API error response to the client.
 * Used for consistent error handling across all locality endpoints.
 *
 * @param response - Express response object.
 * @param statusCode - HTTP status code to return.
 * @param message - Human-readable error message.
 * @param errorDetails - Optional error object for logging (not sent to client).
 */
const writeErrorResponse = (
    response: Response,
    statusCode: number,
    message: string,
    errorDetails?: unknown,
): void => {
    // Log the error details for debugging (not exposed to client)
    if (errorDetails !== undefined) {
        if (VERBOSE)
            errorLogger(`Error [${statusCode}]: ${message}`, errorDetails);
    }

    // Set response headers and send JSON:API error payload
    response.setHeader("Content-Type", JSONAPI_CONTENT_TYPE);
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
export function getLocality(request: SwaggerRequest, response: Response): void {
    // Log the incoming request for debugging
    if (VERBOSE) logger("IN getLocality");

    // Extract the locality ID from the validated Swagger parameters
    const localityId = request.swagger.params.localityId?.value;

    // Guard against missing locality ID (should not occur with proper Swagger validation)
    if (localityId === undefined) {
        writeErrorResponse(
            response,
            400,
            "Missing required parameter: localityId",
        );
        return;
    }

    // Fetch the locality from OpenSearch and handle the response
    const localityPromise = fetchLocality(
        localityId,
    ) as Promise<LocalityResponse>;

    localityPromise
        .then((localityResponse) => {
            // Handle error responses from the service layer (JSON:API error documents)
            if (localityResponse.statusCode !== undefined) {
                // Set JSON:API content type and return the error response
                response.setHeader("Content-Type", JSONAPI_CONTENT_TYPE);
                response.status(localityResponse.statusCode);
                response.json(localityResponse.json);
                return;
            }

            // Handle success responses with HATEOAS links
            if (localityResponse.link !== undefined) {
                response.setHeader("link", localityResponse.link.toString());
            }

            // Set JSON:API content type and write the locality data
            response.setHeader("Content-Type", JSONAPI_CONTENT_TYPE);
            writeJson(response, localityResponse.json);
        })
        .catch((error: unknown) => {
            // Handle unexpected errors from the service layer
            writeErrorResponse(
                response,
                500,
                "An unexpected error occurred while fetching the locality",
                error,
            );
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
export function getLocalities(
    request: SwaggerRequest,
    response: Response,
): void {
    // Extract search query and page number from validated Swagger parameters
    const q = request.swagger.params.q?.value;
    const p = request.swagger.params.p?.value;

    // Construct the base URL for HATEOAS link generation
    const url = new URL(
        request.url,
        `http://localhost:${process.env.PORT ?? "8080"}`,
    );

    // Fetch matching localities from OpenSearch
    // Cast swagger context as the service expects the path.get structure
    const localitiesPromise = fetchLocalities(
        url.pathname,
        request.swagger as Parameters<typeof fetchLocalities>[1],
        q,
        p,
    ) as Promise<LocalityResponse>;

    localitiesPromise
        .then((localitiesResponse) => {
            // Handle error responses from the service layer (JSON:API error documents)
            if (localitiesResponse.statusCode !== undefined) {
                response.setHeader("Content-Type", JSONAPI_CONTENT_TYPE);
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
                response.setHeader(
                    "link-template",
                    localitiesResponse.linkTemplate.toString(),
                );
            }

            // Set JSON:API content type and write the search results
            response.setHeader("Content-Type", JSONAPI_CONTENT_TYPE);
            writeJson(response, localitiesResponse.json);
        })
        .catch((error: unknown) => {
            // Handle unexpected errors from the service layer
            writeErrorResponse(
                response,
                500,
                "An unexpected error occurred while searching localities",
                error,
            );
        });
}
