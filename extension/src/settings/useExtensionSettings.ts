import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RelayDropSyncPreferences } from "../../../src/settings/types";
import {
  DEFAULT_EXTENSION_SYNC_PREFERENCES,
  ExtensionSettingsStore
} from "./ExtensionSettingsStore";

export function useExtensionSettings(accountId: string) {
  const store = useMemo(() => new ExtensionSettingsStore(accountId), [accountId]);
  const [preferences, setPreferences] = useState<RelayDropSyncPreferences>(
    DEFAULT_EXTENSION_SYNC_PREFERENCES
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadRevision = revision.current;
    setIsLoaded(false);
    setError(null);
    void store
      .load()
      .then((stored) => {
        if (!active || revision.current !== loadRevision) return;
        setPreferences(stored);
      })
      .catch(() => {
        if (active) {
          setError("RelayDrop could not load sync settings. Safe defaults are active.");
        }
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [store]);

  const updatePreferences = useCallback(
    (next: RelayDropSyncPreferences) => {
      const previous = preferences;
      const updateRevision = revision.current + 1;
      revision.current = updateRevision;
      setError(null);
      setPreferences(next);
      void store.save(next).catch(() => {
        if (!mounted.current || revision.current !== updateRevision) return;
        setPreferences(previous);
        setError("RelayDrop could not save that setting. Your previous choice was restored.");
      });
    },
    [preferences, store]
  );

  return { preferences, isLoaded, error, updatePreferences };
}
