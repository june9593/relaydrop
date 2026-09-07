import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELAYDROP_THEME,
  RELAYDROP_THEME_STORAGE_KEY,
  RelayDropThemeStore
} from "./theme";
import webBootstrap from "../../public/theme-bootstrap.js?raw";
import extensionBootstrap from "../../extension/public/theme-bootstrap.js?raw";
import webHtml from "../../index.html?raw";
import extensionHtml from "../../extension/sidepanel.html?raw";

describe("RelayDropThemeStore", () => {
  it("uses a safe light theme when no device preference is stored", () => {
    expect(new RelayDropThemeStore(createStorage()).load()).toBe(
      DEFAULT_RELAYDROP_THEME
    );
  });

  it("restores a theme saved by an earlier session", () => {
    const values = new Map<string, string>();
    const storage = createStorage(values);

    new RelayDropThemeStore(storage).save("dark");

    expect(values.get(RELAYDROP_THEME_STORAGE_KEY)).toBe("dark");
    expect(new RelayDropThemeStore(storage).load()).toBe("dark");
  });

  it("falls back to light for an invalid stored value", () => {
    const values = new Map([[RELAYDROP_THEME_STORAGE_KEY, "midnight"]]);
    expect(new RelayDropThemeStore(createStorage(values)).load()).toBe("light");
  });

  it("uses the same synchronous local preference before both applications start", () => {
    for (const bootstrap of [webBootstrap, extensionBootstrap]) {
      expect(bootstrap).toContain(`localStorage.getItem(storageKey)`);
      expect(bootstrap).toContain(`"relaydrop.theme.v1"`);
    }

    expect(webHtml.indexOf("theme-bootstrap.js")).toBeLessThan(
      webHtml.indexOf('type="module"')
    );
    expect(extensionHtml.indexOf("theme-bootstrap.js")).toBeLessThan(
      extensionHtml.indexOf('type="module"')
    );
  });
});

function createStorage(values = new Map<string, string>()) {
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
