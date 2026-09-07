import { describe, expect, it } from "vitest";
import { mobileWebHost, normalizeMobileWebUrl } from "./mobileAccess";

describe("normalizeMobileWebUrl", () => {
  it("accepts an HTTPS web app URL and removes its fragment", () => {
    expect(normalizeMobileWebUrl("https://relaydrop.example/app#recent")).toBe(
      "https://relaydrop.example/app"
    );
  });

  it("allows HTTP only for local development", () => {
    expect(normalizeMobileWebUrl("http://localhost:5173")).toBe(
      "http://localhost:5173/"
    );
    expect(normalizeMobileWebUrl("http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173/"
    );
    expect(normalizeMobileWebUrl("http://relaydrop.example")).toBeUndefined();
  });

  it("rejects executable, credential-bearing, and malformed URLs", () => {
    expect(normalizeMobileWebUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeMobileWebUrl("https://user:pass@relaydrop.example")).toBeUndefined();
    expect(normalizeMobileWebUrl("not a url")).toBeUndefined();
  });
});

describe("mobileWebHost", () => {
  it("shows only the host for a valid configured URL", () => {
    expect(mobileWebHost("https://relaydrop.example/mobile")).toBe(
      "relaydrop.example"
    );
  });
});
