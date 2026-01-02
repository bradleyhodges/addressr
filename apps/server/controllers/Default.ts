import { writeJson } from "@repo/addresskit-core";
import debug from "debug";
import type { Request, Response } from "express";
import { getApiRoot as fetchApiRoot } from "../service/DefaultService";

/**
 * Extended Express Request with Swagger-tools augmentation.
 */
type SwaggerRequest = Request & {
    // biome-ignore lint/suspicious/noExplicitAny: swagger-tools augments request at runtime with untyped data
    swagger: unknown;
};

/**
 * The logger for error handling.
 */
const errorLogger = debug("error:default");

/**
 * Returns API root link relations as Link headers.
 *
 * This endpoint provides HATEOAS entry point for API discoverability,
 * returning available API operations and documentation links in the
 * Link and Link-Template response headers.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param res - Express response.
 *
 * @example
 * GET /
 *
 * Response Headers:
 * Link: </addresses>; rel="addresses", </docs/>; rel="describedby"
 * Link-Template: </addresses{?q,p}>; rel="addresses"
 *
 * Response Body:
 * {}
 */
export function getApiRoot(request: SwaggerRequest, res: Response): void {
    // Fetch the API root link relations from the service
    fetchApiRoot()
        .then((response) => {
            // Set HATEOAS Link header for available resources
            res.setHeader("link", response.link.toString());

            // Set Link-Template header for templated URI discovery (RFC 6570)
            res.setHeader("link-template", response.linkTemplate.toString());

            // Write the (empty) response body
            writeJson(res, response.body);
        })
        .catch((error: unknown) => {
            // Log the error for debugging
            errorLogger("Error fetching API root", error);

            // Return a standardized error response
            res.setHeader("Content-Type", "application/json");
            res.status(500);
            res.json({ error: "An unexpected error occurred" });
        });
}
