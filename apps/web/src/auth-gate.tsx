import { Onboarding, Shimmer } from "@tryopenbot/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";
import { openBotRuntime } from "./runtime.js";

const onboardingSeenKey = "openbot.onboarding-seen";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useStore(openBotRuntime.store, (state) => state.auth);
  const [signingIn, setSigningIn] = useState(false);
  const [seen, setSeen] = useState(() => readSeen());

  useEffect(() => {
    void openBotRuntime.actions.initialize();
  }, []);

  if (auth.status === "checking")
    return (
      <main className="grid min-h-screen place-items-center bg-page">
        <Shimmer className="text-[13px]">Checking access…</Shimmer>
      </main>
    );

  const signedIn = auth.status === "authenticated";

  if (!signedIn || !seen)
    return (
      <Onboarding
        error={auth.error}
        signedIn={signedIn}
        signingIn={signingIn}
        onCancelSignIn={() => setSigningIn(false)}
        onSignIn={() => {
          setSigningIn(true);
          void openBotRuntime.actions
            .signIn()
            .catch(() => undefined)
            .finally(() => setSigningIn(false));
        }}
        onComplete={() => {
          try {
            localStorage.setItem(onboardingSeenKey, "true");
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
