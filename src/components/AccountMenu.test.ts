import { describe, expect, it } from "vitest";
import { accountInitial } from "./AccountMenu";

describe("accountInitial", () => {
  it("keeps a Chinese name as a Unicode grapheme", () => {
    expect(accountInitial("测试用户")).toBe("测");
  });

  it("uses the first visible character for Latin names", () => {
    expect(accountInitial("  alex  ")).toBe("A");
  });
});
