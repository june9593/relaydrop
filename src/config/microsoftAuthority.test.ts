import { describe, expect, it } from "vitest";
import {
  MICROSOFT_CONSUMERS_AUTHORITY,
  normalizeMicrosoftAuthority
} from "./microsoftAuthority";

describe("normalizeMicrosoftAuthority", () => {
  it("accepts only the personal Microsoft account authority", () => {
    expect(normalizeMicrosoftAuthority(undefined)).toBe(
      MICROSOFT_CONSUMERS_AUTHORITY
    );
    expect(
      normalizeMicrosoftAuthority("https://login.microsoftonline.com/consumers/")
    ).toBe(MICROSOFT_CONSUMERS_AUTHORITY);
  });

  it("rejects lookalike, credential-bearing, and broader authorities", () => {
    expect(
      normalizeMicrosoftAuthority("https://login-lookalike.example/consumers")
    ).toBeUndefined();
    expect(
      normalizeMicrosoftAuthority(
        ["https://user:password", "login.microsoftonline.com/consumers"].join("@")
      )
    ).toBeUndefined();
    expect(
      normalizeMicrosoftAuthority("https://login.microsoftonline.com/common")
    ).toBeUndefined();
  });
});
