/**
 * Express-style response instance.
 */
export type JsonResponse = {
    status: (code: number) => JsonResponse;
    setHeader: (name: string, value: string) => JsonResponse;
    json: (body: unknown) => void;
};
/**
 * Structured payload carrying a status code and serialized body.
 */
export declare class ResponsePayload<T> {
    /**
     * The HTTP status code to return.
     */
    code: number;
    /**
     * The response body to serialize as JSON.
     */
    payload: T;
    /**
     * @param {number} code - HTTP status code to return.
     * @param {T} payload - Response body to serialize as JSON.
     */
    constructor(code: number, payload: T);
}
/**
 * Builds a structured payload for JSON responses.
 *
 * @template T
 * @param {number} code - HTTP status code to return.
 * @param {T} payload - Response body to serialize as JSON.
 * @returns {ResponsePayload<T>} Structured payload wrapper.
 */
export declare function respondWithCode<T>(code: number, payload: T): ResponsePayload<T>;
/**
 * Writes a JSON response to the provided Express response object.
 *
 * @template T
 * @param {JsonResponse} response - Express-style response instance.
 * @param {T | ResponsePayload<T>} bodyOrPayload - Raw body or structured payload wrapper.
 * @param {number | undefined} statusOverride - Optional status code override.
 * @returns {void} Nothing.
 */
export declare function writeJson<T>(response: JsonResponse, bodyOrPayload: T | ResponsePayload<T>, statusOverride?: number): void;
//# sourceMappingURL=writer.d.ts.map