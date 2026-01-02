import type { Request, Response } from "express";
/**
 * Extended Express Request with Swagger-tools augmentation.
 * Swagger-tools middleware attaches parsed parameters and metadata.
 */
type SwaggerRequest = Request & {
    swagger: {
        /** Parsed and validated request parameters */
        params: {
            addressId?: {
                value: string;
            };
            q?: {
                value: string | undefined;
            };
            p?: {
                value: number | undefined;
            };
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
 * Fetches a single address by its unique G-NAF PID.
 *
 * This endpoint returns the full structured address data including
 * building name, street details, locality, postcode, and optional
 * geocoding information.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
export declare function getAddress(request: SwaggerRequest, response: Response): void;
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
export declare function getAddresses(request: SwaggerRequest, response: Response): void;
export {};
//# sourceMappingURL=Addresses.d.ts.map