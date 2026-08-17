import type { ClientAuthAdapter } from "./contracts/auth.js";
import type { OpenBotClient } from "./chat/client.js";

export function createClientAuthAdapter(
  client: OpenBotClient,
  platform: Pick<ClientAuthAdapter, "signIn"> & Partial<Pick<ClientAuthAdapter, "signOut">>,
): ClientAuthAdapter {
  return {
    getSession: () => client.getSession(),
    signIn: platform.signIn,
    async signOut() {
      await client.logout();
      await platform.signOut?.();
    },
  };
}
