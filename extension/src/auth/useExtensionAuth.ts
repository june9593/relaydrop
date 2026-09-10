import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ExtensionAccount,
  ExtensionAuthService
} from "./ExtensionAuthService";

export function useExtensionAuth(service: ExtensionAuthService) {
  const [account, setAccount] = useState<ExtensionAccount | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const storageRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const unsubscribe = service.subscribe((nextAccount) => {
      storageRevision.current += 1;
      if (active) {
        setAccount(nextAccount);
        setRequiresReconnect(service.requiresReconnect);
      }
    });
    const initialRevision = storageRevision.current;

    service
      .initialize()
      .then((nextAccount) => {
        if (active && storageRevision.current === initialRevision) {
          setAccount(nextAccount);
          setRequiresReconnect(service.requiresReconnect);
        }
      })
      .catch(() => {
        if (active) setError("RelayDrop could not initialize Microsoft sign-in.");
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      setAccount(await service.signIn());
    } catch {
      setError("Microsoft sign-in was not completed.");
    }
  }, [service]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await service.signOut();
      setAccount(null);
    } catch (caught) {
      setError("RelayDrop could not disconnect this account.");
      throw caught;
    }
  }, [service]);

  return { account, isInitializing, error, requiresReconnect, signIn, signOut };
}
