import LinkHeader = require("http-link-header");
/**
 * Response structure for the API root endpoint.
 */
type ApiRootResponse = {
    /** HATEOAS Link header containing available resource links */
    link: LinkHeader;
    /** Empty response body (links are in headers per HATEOAS pattern) */
    body: Record<string, unknown>;
    /** Link-Template header for templated URI discovery (RFC 6570) */
    linkTemplate: LinkHeader;
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
export declare function getApiRoot(): Promise<ApiRootResponse>;
export {};
//# sourceMappingURL=DefaultService.d.ts.map