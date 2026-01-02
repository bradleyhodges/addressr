import { writeJson } from "@repo/addresskit-core";
import type { Request, Response } from "express";
import { getApiRoot as fetchApiRoot } from "../service/DefaultService";

type SwaggerRequest = Request & {
    // biome-ignore lint/suspicious/noExplicitAny: swagger-tools augments request at runtime
    swagger: any;
};

/**
 * Returns API root link relations as Link headers.
 *
 * @param {SwaggerRequest} request - Express request augmented with Swagger metadata.
 * @param {Response} res - Express response.
 */
export function getApiRoot(request: SwaggerRequest, res: Response): void {
    // Fetch the API root
    fetchApiRoot()
        .then((response) => {
            // Set the response headers
            res.setHeader("link", response.link.toString());
            res.setHeader("link-template", response.linkTemplate.toString());

            // Write the JSON response
            writeJson(res, response.body);
        })
        .catch((error) => {
            writeJson(res, error.body);
        });
}
