import { describe, expect, it } from "vitest";
import type { RelayDropDownloadState } from "../downloads/RelayDropDownloadManager";
import { mergeQueriedDownloadStates } from "./useRelayDrop";

describe("mergeQueriedDownloadStates", () => {
  it("preserves a newer local state when an older query completes", () => {
    const downloading: RelayDropDownloadState = {
      itemId: "item-a",
      fileName: "report.pdf",
      status: "downloading"
    };

    expect(
      mergeQueriedDownloadStates(
        { "item-a": downloading },
        {},
        ["item-a"],
        new Map([["item-a", 1]]),
        new Map([["item-a", 0]])
      )
    ).toEqual({ "item-a": downloading });
  });

  it("applies queried state when the item did not change locally", () => {
    const complete: RelayDropDownloadState = {
      itemId: "item-a",
      fileName: "report.pdf",
      status: "complete",
      downloadId: 7
    };

    expect(
      mergeQueriedDownloadStates(
        {},
        { "item-a": complete },
        ["item-a"],
        new Map([["item-a", 0]]),
        new Map([["item-a", 0]])
      )
    ).toEqual({ "item-a": complete });
  });
});
