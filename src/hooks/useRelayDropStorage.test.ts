import { describe, expect, it } from "vitest";
import { formatStorageBytes } from "./useRelayDropStorage";

describe("formatStorageBytes", () => {
  it("formats app-folder usage for compact UI", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(1536)).toBe("1.5 KB");
    expect(formatStorageBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});
