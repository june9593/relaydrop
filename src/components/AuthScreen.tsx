import { CloudIcon } from "./Icons";

interface AuthScreenProps {
  state: "loading" | "signed-out" | "configuration-error";
  error?: string;
  onSignIn?: () => void;
}

export function AuthScreen({ state, error, onSignIn }: AuthScreenProps) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="auth-mark" aria-hidden="true">
          <span />
        </span>
        <p className="eyebrow">RelayDrop</p>
        <h1>Your private space between devices</h1>
        <p className="auth-description">
          Sign in with your personal Microsoft account. RelayDrop requests access only to its own
          OneDrive app folder.
        </p>

        {state === "loading" && (
          <div className="auth-loading">Checking your Microsoft session…</div>
        )}

        {state === "signed-out" && (
          <>
            <button className="microsoft-button" type="button" onClick={onSignIn}>
              <span className="microsoft-symbol" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              Continue with Microsoft
            </button>
            {error && <p className="auth-error">{error}</p>}
          </>
        )}

        {state === "configuration-error" && (
          <div className="configuration-error" role="alert">
            <strong>Configuration required</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="auth-permission">
          <CloudIcon />
          <span>
            <strong>Files.ReadWrite.AppFolder</strong>
            Cannot browse the rest of your OneDrive
          </span>
        </div>
      </section>
    </main>
  );
}
