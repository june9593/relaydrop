import type { RelayDropTheme } from "./types";

export const RELAYDROP_THEME_STORAGE_KEY = "relaydrop.theme.v1";
export const DEFAULT_RELAYDROP_THEME: RelayDropTheme = "light";

export interface RelayDropThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const THEME_COLORS: Record<RelayDropTheme, string> = {
  light: "#faf9f5",
  dark: "#191816"
};

export class RelayDropThemeStore {
  constructor(private readonly storage: RelayDropThemeStorage = getDefaultStorage()) {}

  load(): RelayDropTheme {
    return parseTheme(this.storage.getItem(RELAYDROP_THEME_STORAGE_KEY));
  }

  save(theme: RelayDropTheme): void {
    this.storage.setItem(RELAYDROP_THEME_STORAGE_KEY, theme);
  }
}

export function applyRelayDropTheme(theme: RelayDropTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

export function applyStoredRelayDropTheme(): RelayDropTheme {
  let theme = DEFAULT_RELAYDROP_THEME;
  try {
    theme = new RelayDropThemeStore().load();
  } catch {
    // The light default is safe if local storage is unavailable.
  }
  applyRelayDropTheme(theme);
  return theme;
}

function parseTheme(value: unknown): RelayDropTheme {
  return value === "dark" || value === "light" ? value : DEFAULT_RELAYDROP_THEME;
}

function getDefaultStorage(): RelayDropThemeStorage {
  const storage = globalThis.localStorage;
  if (!storage) {
    throw new Error("RelayDrop theme storage is unavailable.");
  }
  return storage;
}
