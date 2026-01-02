import { writeJson } from "@repo/addresskit-core";
import debug from "debug";
import type { Request, Response } from "express";
import {
    getAddress as fetchAddress,
    getAddresses as fetchAddresses,
} from "../service";

type AddressResponse = {
    statusCode?: number;
    json: unknown;
    link?: { toString(): string };
    linkTemplate?: { toString(): string };
};

type SwaggerRequest = Request & {
    // biome-ignore lint/suspicious/noExplicitAny: swagger-tools augments request at runtime
    swagger: any;
};

/**
 * The logger for the API.
 */
const logger = debug("api");

/**
 * Fetches a single address by ID.
 *
 * @param {SwaggerRequest} request - Express request augmented with Swagger metadata.
 * @param {Response} response - Express response.
 */
export function getAddress(request: SwaggerRequest, response: Response): void {
    // Log the request
    logger("IN getAddress");

    // Get the address ID from the request
    const addressId = request.swagger.params.addressId.value;

    // Fetch the address
    const addressPromise = fetchAddress(addressId) as Promise<AddressResponse>;

    addressPromise.then((addressResponse) => {
        // If the address response has a status code, set the response headers and status code
        // and write the JSON response
        if (addressResponse.statusCode) {
            response.setHeader("Content-Type", "application/json");
            response.status(addressResponse.statusCode);
            response.json(addressResponse.json);
        } else {
            // If the address response does not have a status code, set the response headers
            // and write the JSON response
            if (addressResponse.link) {
                response.setHeader("link", addressResponse.link.toString());
            }
            writeJson(response, addressResponse.json);
        }
    });
}

/**
 * Searches for addresses.
 *
 * @param {SwaggerRequest} request - Express request augmented with Swagger metadata.
 * @param {Response} response - Express response.
 */
export function getAddresses(
    request: SwaggerRequest,
    response: Response,
): void {
    // Get the query and page from the request
    const q = request.swagger.params.q.value;
    const p = request.swagger.params.p.value;

    // Get the URL from the request
    const url = new URL(
        request.url,
        `http://localhost:${process.env.port || 8080}`,
    );

    // Fetch the addresses
    const addressesPromise = fetchAddresses(
        url.pathname,
        request.swagger,
        q,
        p,
    ) as Promise<AddressResponse>;

    addressesPromise.then((addressesResponse) => {
        // If the addresses response has a status code, set the response headers and status code
        // and write the JSON response
        if (addressesResponse.statusCode) {
            response.setHeader("Content-Type", "application/json");
            response.status(addressesResponse.statusCode);
            response.json(addressesResponse.json);
        } else {
            // If the addresses response does not have a status code, set the response header
            if (addressesResponse.link) {
                response.setHeader("link", addressesResponse.link.toString());
            }
            if (addressesResponse.linkTemplate) {
                response.setHeader(
                    "link-template",
                    addressesResponse.linkTemplate.toString(),
                );
            }

            // Write the JSON response
            writeJson(response, addressesResponse.json);
        }
    });
}
