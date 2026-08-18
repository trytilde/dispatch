import { type ReactNode, useEffect } from "react";
import { useStore } from "zustand";
import { openBotRuntime } from "./runtime.js";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useStore(openBotRuntime.store, (state) => state.auth);

  useEffect(() => {
    void openBotRuntime.actions.initialize();
  }, []);

  if (auth.status === "checking")
    return (
      <main className="grid min-h-screen place-items-center text-sm text-neutral-500">
        Checking access…
      </main>
    );
  if (auth.status === "unauthenticated")
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-50 p-6">
        <section className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-neutral-950">Sign in to OpenBot</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Use a Tilde account that belongs to this OpenBot deployment&apos;s team.
          </p>
          {auth.error ? <p className="mt-3 text-sm text-red-600">{auth.error}</p> : null}
          <button
            className="mt-6 w-full rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            type="button"
            onClick={() => void openBotRuntime.actions.signIn().catch(() => undefined)}
          >
            Continue with Tilde
          </button>
        </section>
      </main>
    );
  return children;
}
