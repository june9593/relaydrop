import { describe, expect, it } from "vitest";
import {
  isRelayDropRefreshDue,
  resolveRelayDropSyncPolicy
} from "./RelayDropFeedCache";

describe("RelayDrop feed refresh policy", () => {
  it("refreshes stale data but keeps a recent success inside the cooldown", () => {
    const now = Date.UTC(2026, 8, 6, 10, 0, 0);
    expect(
      isRelayDropRefreshDue(new Date(now - 30_000), 120_000, now)
    ).toBe(false);
    expect(
      isRelayDropRefreshDue(new Date(now - 120_000), 120_000, now)
    ).toBe(true);
  });

  it("does not let a far-future timestamp suppress refresh indefinitely", () => {
    const now = Date.UTC(2026, 8, 6, 10, 0, 0);
    expect(
      isRelayDropRefreshDue(new Date(now + 60 * 60 * 1000), 120_000, now)
    ).toBe(true);
  });

  it("falls back from invalid interval overrides", () => {
    expect(
      resolveRelayDropSyncPolicy({ openCooldownMs: -1 }).openCooldownMs
    ).toBe(120_000);
  });
});
