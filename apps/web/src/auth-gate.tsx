import {
  BrandedLoadingState,
  Onboarding,
  WorkspaceAccessScreen,
  type OnboardingResult,
} from "@trytilde/dispatch-ui";
import {
  completeOnboarding,
  loadOnboarding,
  type OnboardingStorage,
} from "@trytilde/dispatch-client-runtime";
import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "zustand";
import { dispatchRuntime } from "./runtime.js";
import { useClientWorkspace } from "./workspaces.js";

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

export function AuthGate({
  children,
  skipOnboarding = false,
}: {
  children: ReactNode;
  skipOnboarding?: boolean;
}) {
  const auth = useStore(dispatchRuntime.store, (state) => state.auth);
  const workspace = useClientWorkspace();
  const [signingIn, setSigningIn] = useState(false);
  const [seen, setSeen] = useState<boolean | undefined>(skipOnboarding ? true : undefined);

  // Settings only need authenticated agent navigation. The workspace upgrades this
  // initialization to include conversations, previews, and the team event stream.
  useEffect(() => {
    void dispatchRuntime.actions.initialize({
      workspace: !window.location.pathname.startsWith("/settings"),
    });
  }, []);

  useEffect(() => {
    if (!skipOnboarding)
      void loadOnboarding(browserStorage).then((state) => setSeen(state.completed));
  }, [skipOnboarding]);

  if (auth.status === "checking" || seen === undefined)
    return <BrandedLoadingState label="Checking access…" />;

  const signedIn = auth.status === "authenticated";

  if (!signedIn && skipOnboarding)
    return (
      <WorkspaceAccessScreen
        error={auth.error}
        name={workspace.workspaceName}
        signingIn={signingIn}
        onSignIn={() => {
          setSigningIn(true);
          void dispatchRuntime.actions
            .signIn({ workspace: !window.location.pathname.startsWith("/settings") })
            .catch(() => undefined)
            .finally(() => setSigningIn(false));
        }}
        onSwitchWorkspace={() => workspace.openWorkspaceSelector()}
      />
    );

  if (!signedIn || !seen)
    return (
      <Onboarding
        error={auth.error}
        signedIn={signedIn}
        signingIn={signingIn}
        onCancelSignIn={() => setSigningIn(false)}
        onSignIn={() => {
          setSigningIn(true);
          void dispatchRuntime.actions
            .signIn()
            .catch(() => undefined)
            .finally(() => setSigningIn(false));
        }}
        onComplete={(result: OnboardingResult) => {
          void completeOnboarding(browserStorage, result).then((state) => setSeen(state.completed));
        }}
      />
    );

  return children;
}
