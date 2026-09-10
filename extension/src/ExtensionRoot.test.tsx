// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { webcrypto } from "node:crypto";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ExtensionRoot from "./ExtensionRoot";
import { ExtensionFeedCache } from "./cache/ExtensionFeedCache";

vi.mock("./config", () => ({ getExtensionRuntimeConfig: () => ({
  clientId: "11111111-2222-4333-8444-555555555555",
  authority: "https://login.microsoftonline.com/consumers"
}) }));

it("reopens the real extension UI offline after session storage is lost and still clears data on explicit logout", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const values = new Map<string, unknown>([
    ["relaydrop.extension.auth-epoch.v1", "known-epoch"],
    ["relaydrop.extension.connected.v1.known-epoch", true],
    ["relaydrop.extension.account.v1.known-epoch", { id: "account-a", name: "Alex", username: "alex@example.com" }]
  ]);
  const storage = (data: Map<string, unknown>) => ({
    async get(keys: string | string[]) { return Object.fromEntries((typeof keys === "string" ? [keys] : keys).map(key => [key, data.get(key)])); },
    async set(entries: Record<string, unknown>) { for (const [key,value] of Object.entries(entries)) data.set(key,value); },
    async remove(keys: string | string[]) { for (const key of typeof keys === "string" ? [keys] : keys) data.delete(key); }
  });
  const local = storage(values);
  await new ExtensionFeedCache("account-a", local).save({
    items: [{ id: "cached-note", type: "text", text: "Still here after two days", source: "desktop",
      createdAt: "2026-09-08T00:00:00Z", serverCreatedAt: "2026-09-08T00:00:00Z" }],
    totalItems: 1, lastRefreshedAt: "2026-09-08T00:00:00Z"
  });
  const network = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", network);
  vi.stubGlobal("chrome", {
    identity: { getRedirectURL: () => "https://abcdefghijklmnop.chromiumapp.org/oauth2", launchWebAuthFlow: network },
    storage: { local, session: storage(new Map()) },
    downloads: { search: vi.fn(async () => []), onChanged: { addListener: vi.fn(), removeListener: vi.fn() } }
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<StrictMode><ExtensionRoot /></StrictMode>));
    expect(host.textContent).toContain("Still here after two days");
    expect(host.querySelector<HTMLElement>("#relay-composer")?.hidden).toBe(true);
    await act(async () => {
      await vi.waitFor(() => expect(network).toHaveBeenCalled());
    });
    expect(host.textContent).toContain("Still here after two days");
    expect(host.textContent).toContain("Reconnect Microsoft");
    expect(network).not.toHaveBeenCalledWith(expect.stringContaining("graph.microsoft.com"), expect.anything());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open account menu for Alex"]')!.click());
    const logout = Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Log out"));
    expect(logout).toBeTruthy();
    await act(async () => logout!.click());
    expect(host.textContent).not.toContain("Still here after two days");
    await expect(new ExtensionFeedCache("account-a", local).load()).resolves.toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
