import { describe, expect, it } from "vitest";

import isSameOriginRequest from "./same-origin";

function request(headers) {
  return { headers, socket: {} };
}

describe("utils/proxy/same-origin", () => {
  it("accepts a request whose Origin matches the Host it was sent to", () => {
    expect(
      isSameOriginRequest(request({ origin: "http://home.example.test:3000", host: "home.example.test:3000" })),
    ).toBe(true);
  });

  it("rejects another site's Origin", () => {
    expect(isSameOriginRequest(request({ origin: "https://evil.example.test", host: "home.example.test:3000" }))).toBe(
      false,
    );
  });

  it("rejects a request without an Origin", () => {
    expect(isSameOriginRequest(request({ host: "home.example.test:3000" }))).toBe(false);
  });

  it("rejects a browser-declared cross-site request even when the Origin looks right", () => {
    expect(
      isSameOriginRequest(
        request({
          origin: "http://home.example.test:3000",
          host: "home.example.test:3000",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
  });
});
