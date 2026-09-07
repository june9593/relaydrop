import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import type { MicrosoftAuthService } from "./MicrosoftAuthService";

export function useMicrosoftAuth(service: MicrosoftAuthService) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    service
      .initialize()
      .then((nextAccount) => {
        if (active) {
          setAccount(nextAccount);
        }
      })
      .catch(() => {
        if (active) {
          setError("RelayDrop could not initialize Microsoft sign-in.");
        }
      })
      .finally(() => {
        if (active) {
          setIsInitializing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [service]);

  const signIn = useCallback(async () => {
    setError(null);

    try {
      await service.signIn();
    } catch {
      setError("Microsoft sign-in could not be started.");
    }
  }, [service]);

  const signOut = useCallback(async () => {
    if (!account) {
      return;
    }

    setError(null);

    try {
      await service.signOut(account);
    } catch (caught) {
      setError("RelayDrop could not sign out.");
      throw caught;
    }
  }, [account, service]);

  return {
    account,
    isInitializing,
    error,
    signIn,
    signOut
  };
}
