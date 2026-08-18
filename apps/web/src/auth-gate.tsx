import { Onboarding, Shimmer, type OnboardingResult } from "@tryopenbot/ui";
import {
  completeOnboarding,
  loadOnboarding,
  type OnboardingStorage,
} from "@tryopenbot/client-runtime";
import { type ReactNode, useEffect, useState } from "react";

type Session = { authenticated: true; user: { subject: string; email?: string } };

// Onboarding state is owned by the client runtime per ADR-0017; the browser only
// supplies storage. `localStorage` throws outright in some privacy modes, so every
// access is guarded and a failure reads as "not onboarded" rather than breaking boot.
const browserStorage: OnboardingStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Non-persistent environments still proceed into the app.
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  },
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [seen, setSeen] = useState<boolean>();

  useEffect(() => {
    void loadSession()
      .then(setSession)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Authentication is unavailable");
        setSession(null);
      });
  }, []);

  useEffect(() => {
    void loadOnboarding(browserStorage).then((state) => setSeen(state.completed));
  }, []);

  if (session === undefined || seen === undefined)
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
          void completeOnboarding(browserStorage, result).then((state) => setSeen(state.completed));
        }}
      />
    );

  return children;
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
