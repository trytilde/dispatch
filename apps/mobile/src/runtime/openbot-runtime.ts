import {
  createOpenBotClient,
  createOpenBotRuntime,
  type ClientInstallation,
  type OpenBotClient,
} from "@tryopenbot/client-runtime";
import { fetch as expoFetch } from "expo/fetch";
import { createNativeAuth } from "../auth/native-auth";

export function createMobileRuntime(installation: ClientInstallation) {
  let client: OpenBotClient;
  const auth = createNativeAuth(installation, () => client);
  client = createOpenBotClient({
    baseUrl: installation.control_origin,
    fetch: expoFetch,
    getAccessToken: () => auth.getAccessToken(),
  });
  return createOpenBotRuntime({ client, auth });
}
