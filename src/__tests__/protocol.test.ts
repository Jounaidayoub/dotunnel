import { describe, expect, it } from "vitest";
import {
	decodeTunnelMessage,
	decodeTunnelResponse,
	encodeTunnelRequest,
} from "../core/protocol";

describe("protocol helpers", () => {
	it("encodes and decodes request payloads", () => {
		const payload = {
			id: "req-1",
			path: "/hello",
			method: "GET",
			headers: { "x-demo": "true" },
		};
		const encoded = encodeTunnelRequest(payload);
		const decoded = decodeTunnelMessage(encoded);
		expect(decoded).toEqual(payload);
	});

	it("returns null for non-response payloads", () => {
		const errorPayload = { error: "Failed", details: "nope" };
		const encoded = JSON.stringify(errorPayload);
		expect(decodeTunnelResponse(encoded)).toBeNull();
	});

	it("decodes response payloads", () => {
		const response = {
			id: "res-1",
			status: 201,
			headers: { "content-type": "text/plain" },
			body: "ok",
		};
		const encoded = JSON.stringify(response);
		const decoded = decodeTunnelResponse(encoded);
		expect(decoded).toEqual(response);
	});
});
