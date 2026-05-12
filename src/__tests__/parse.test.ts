import { describe, expect, it } from "vitest";
import { parseTunnelName } from "../core/parse";


describe("parseTunnelName", () => {
	it("returns name for prxy subdomain", () => {
		const request = new Request("https://demo-prxy.example.com/");
		expect(parseTunnelName(request)).toBe("demo");
	});

	it("returns null for non-matching hostname", () => {
		const request = new Request("https://demo.example.com/");
		expect(parseTunnelName(request)).toBeNull();
	});

	it("returns null when name is empty", () => {
		const request = new Request("https://-prxy.example.com/");
		expect(parseTunnelName(request)).toBeNull();
	});
});
