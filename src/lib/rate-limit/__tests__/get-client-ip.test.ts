import { describe, it, expect } from "vitest";
import { getClientIp } from "../get-client-ip";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/test", { headers });
}

describe("getClientIp", () => {
  it("returns the first entry of x-forwarded-for", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1, 192.168.1.1" });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = makeRequest({ "x-real-ip": "203.0.113.2" });
    expect(getClientIp(req)).toBe("203.0.113.2");
  });

  it("returns 'unknown' when no IP header is present", () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for entries", () => {
    const req = makeRequest({ "x-forwarded-for": "  203.0.113.3  , 10.0.0.2" });
    expect(getClientIp(req)).toBe("203.0.113.3");
  });

  it("trims whitespace from x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "  203.0.113.4  " });
    expect(getClientIp(req)).toBe("203.0.113.4");
  });
});
