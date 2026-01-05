import type { Request, Response } from "express";
/**
 * Extended Express Request with Swagger-tools augmentation.
 * Swagger-tools middleware attaches parsed parameters and metadata.
 */
type SwaggerRequest = Request & {
    swagger: {
        /** Parsed and validated request parameters */
        params: {
            localityId?: {
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
 * Fetches a single locality by its unique G-NAF Locality PID.
 *
 * This endpoint returns the full locality data including
 * name, state, postcodes, and classification.
 *
 * @param request - Express request augmented with Swagger metadata.
 * @param response - Express response.
 */
export declare function getLocality(request: SwaggerRequest, response: Response): void;
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
export declare function getLocalities(request: SwaggerRequest, response: Response): void;
export {};
//# sourceMappingURL=Localities.d.ts.map