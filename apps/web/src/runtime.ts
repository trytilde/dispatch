import {
  createClientAuthAdapter,
  createOpenBotClient,
  createOpenBotRuntime,
  type ClientAuthAdapter,
} from "@tryopenbot/client-runtime";

const client = createOpenBotClient();

const auth: ClientAuthAdapter = window.openbotDesktop
  ? {
      getSession: () => window.openbotDesktop!.authStatus(),
      signIn: () => window.openbotDesktop!.signIn(),
      signOut: () => window.openbotDesktop!.signOut(),
    }
  : createClientAuthAdapter(client, {
      async signIn() {
        window.location.assign("/auth/login");
      },
    });

export const openBotRuntime = createOpenBotRuntime({ client, auth });
