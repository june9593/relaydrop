import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";

describe("Edge extension manifest", () => {
  it("uses the native side panel with a small permission set", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(116);
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.permissions).toEqual([
      "sidePanel",
      "identity",
      "storage",
      "downloads",
      "downloads.open"
    ]);
  });

  it("does not request browsing or local-file access", () => {
    const serialized = JSON.stringify(manifest);

    expect(serialized).not.toContain("activeTab");
    expect(serialized).not.toContain("tabs");
    expect(serialized).not.toContain("history");
    expect(serialized).not.toContain("file://");
    expect(serialized).not.toContain("content_scripts");
  });

  it("keeps executable code local to the extension package", () => {
    expect(manifest.content_security_policy.extension_pages).toContain(
      "script-src 'self'"
    );
    expect(manifest.content_security_policy.extension_pages).not.toContain(
      "unsafe-eval"
    );
    expect(manifest.content_security_policy.extension_pages).not.toContain(
      "unsafe-inline"
    );
    expect(manifest.content_security_policy.extension_pages).toContain(
      "form-action 'none'"
    );
    expect(manifest.content_security_policy.extension_pages).toContain(
      "frame-src 'none'"
    );
    expect(manifest.content_security_policy.extension_pages).toContain(
      "worker-src 'none'"
    );
  });
});
