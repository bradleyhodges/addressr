"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponsePayload = void 0;
exports.respondWithCode = respondWithCode;
exports.writeJson = writeJson;
/**
 * Structured payload carrying a status code and serialized body.
 */
class ResponsePayload {
    /**
     * The HTTP status code to return.
     */
    code;
    /**
     * The response body to serialize as JSON.
     */
    payload;
    /**
     * @param {number} code - HTTP status code to return.
     * @param {T} payload - Response body to serialize as JSON.
     */
    constructor(code, payload) {
        this.code = code;
        this.payload = payload;
    }
}
exports.ResponsePayload = ResponsePayload;
/**
 * Builds a structured payload for JSON responses.
 *
 * @template T
 * @param {number} code - HTTP status code to return.
 * @param {T} payload - Response body to serialize as JSON.
 * @returns {ResponsePayload<T>} Structured payload wrapper.
 */
function respondWithCode(code, payload) {
    return new ResponsePayload(code, payload);
}
/**
 * Writes a JSON response to the provided Express response object.
 *
 * @template T
 * @param {JsonResponse} response - Express-style response instance.
 * @param {T | ResponsePayload<T>} bodyOrPayload - Raw body or structured payload wrapper.
 * @param {number | undefined} statusOverride - Optional status code override.
 * @returns {void} Nothing.
 */
function writeJson(response, bodyOrPayload, statusOverride) {
    // If the body or payload is a ResponsePayload, write the payload and code
    if (bodyOrPayload instanceof ResponsePayload) {
        writeJson(response, bodyOrPayload.payload, bodyOrPayload.code);
        return;
    }
    // Derive the status code from the body or payload or default to 200
    const derivedStatus = statusOverride ??
        (typeof bodyOrPayload === "number" ? bodyOrPayload : undefined) ??
        200;
    // Derive the payload from the body or payload or default to the body or payload
    const payload = statusOverride !== undefined
        ? bodyOrPayload
        : typeof bodyOrPayload === "number"
            ? bodyOrPayload
            : bodyOrPayload;
    // Set the status code and headers
    response.status(derivedStatus);
    response.setHeader("Content-Type", "application/json");
    // Write the payload as JSON
    response.json(payload);
}
//# sourceMappingURL=writer.js.map