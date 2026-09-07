import { useCallback, useMemo, useState } from "react";
import type { RelayDropTheme } from "../settings/types";
import {
  applyRelayDropTheme,
  DEFAULT_RELAYDROP_THEME,
  RelayDropThemeStore
} from "../settings/theme";

export function useRelayDropTheme() {
  const store = useMemo(() => new RelayDropThemeStore(), []);
  const [theme, setTheme] = useState<RelayDropTheme>(() => {
    try {
      return store.load();
    } catch {
      return DEFAULT_RELAYDROP_THEME;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const updateTheme = useCallback(
    (next: RelayDropTheme) => {
      if (next === theme) return;
      const previous = theme;
      setError(null);
      setTheme(next);
      applyRelayDropTheme(next);
      try {
        store.save(next);
      } catch {
        setTheme(previous);
        applyRelayDropTheme(previous);
        setError("RelayDrop could not save that theme. Your previous choice was restored.");
      }
    },
    [store, theme]
  );

  return { theme, error, updateTheme };
}
