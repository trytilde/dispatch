import { Onboarding, Shimmer, type OnboardingResult } from "@tryopenbot/ui";
import { type ReactNode, useEffect, useState } from "react";

type Session = { authenticated: true; user: { subject: string; email?: string } };

const onboardingSeenKey = "openbot.onboarding-seen";
const onboardingResultKey = "openbot.onboarding-result";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [seen, setSeen] = useState(() => readSeen());

  useEffect(() => {
    void loadSession()
      .then(setSession)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Authentication is unavailable");
        setSession(null);
      });
  }, []);

  if (session === undefined)
    return (
      <main className="grid min-h-screen place-items-center bg-page">
        <Shimmer className="text-[13px]">Checking access…</Shimmer>
      </main>
    );

  if (!session || !seen)
    return (
      <Onboarding
        error={error}
        signedIn={Boolean(session)}
        signingIn={signingIn}
        onCancelSignIn={() => setSigningIn(false)}
        onSignIn={() => {
          setSigningIn(true);
          void signIn().catch((reason: unknown) => {
            setSigningIn(false);
            setError(reason instanceof Error ? reason.message : "Sign in failed");
          });
        }}
        onComplete={(result: OnboardingResult) => {
          try {
            localStorage.setItem(onboardingSeenKey, "true");
            localStorage.setItem(onboardingResultKey, JSON.stringify(result));
          } catch {
            // Non-persistent environments still proceed into the app.
          }
          setSeen(true);
        }}
      />
    );

  return children;
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(onboardingSeenKey) === "true";
  } catch {
    return true;
  }
}

async function loadSession(): Promise<Session | null> {
  if (window.openbotDesktop) return window.openbotDesktop.authStatus();
  const response = await fetch("/auth/session");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Authentication check failed (${response.status})`);
  return (await response.json()) as Session;
}

async function signIn(): Promise<void> {
  if (window.openbotDesktop) {
    await window.openbotDesktop.signIn();
    window.location.reload();
    return;
  }
  window.location.assign("/auth/login");
}
