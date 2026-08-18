import {
  AuthRequest,
  ResponseType,
  makeRedirectUri,
  type DiscoveryDocument,
} from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import type {
  AuthenticatedSession,
  ClientInstallation,
  ClientAuthAdapter,
  OpenBotClient,
} from "@tryopenbot/client-runtime";

const tokenKey = "openbot.owner.tokens.v1";

interface StoredTokens {
  controlOrigin: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface NativeAuth extends ClientAuthAdapter {
  getAccessToken(): Promise<string | undefined>;
}

export function createNativeAuth(
  installation: ClientInstallation,
  getClient: () => OpenBotClient,
): NativeAuth {
  const redirectUri = makeRedirectUri({ scheme: "openbot", path: "auth/callback" });

  async function readTokens(): Promise<StoredTokens | undefined> {
    const value = await SecureStore.getItemAsync(tokenKey);
    if (!value) return undefined;
    try {
      const parsed = JSON.parse(value) as StoredTokens;
      if (parsed.controlOrigin !== installation.control_origin) {
        await SecureStore.deleteItemAsync(tokenKey);
        return undefined;
      }
      return parsed;
    } catch {
      await SecureStore.deleteItemAsync(tokenKey);
      return undefined;
    }
  }

  async function writeTokens(tokens: StoredTokens): Promise<void> {
    await SecureStore.setItemAsync(tokenKey, JSON.stringify(tokens), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async function exchange(fields: Record<string, string>): Promise<StoredTokens> {
    const response = await expoFetch(installation.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    if (!response.ok) throw new Error(`OIDC token exchange failed (${response.status})`);
    const body = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) throw new Error("OIDC token response is incomplete");
    return {
      controlOrigin: installation.control_origin,
      accessToken: body.access_token,
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      expiresAt: Date.now() + (body.expires_in ?? 300) * 1_000,
    };
  }

  async function getAccessToken(): Promise<string | undefined> {
    const stored = await readTokens();
    if (!stored) return undefined;
    if (stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
    if (!stored.refreshToken) {
      await SecureStore.deleteItemAsync(tokenKey);
      return undefined;
    }
    try {
      const refreshed = await exchange({
        grant_type: "refresh_token",
        refresh_token: stored.refreshToken,
        client_id: installation.client_id,
      });
      const next = { ...refreshed, refreshToken: refreshed.refreshToken ?? stored.refreshToken };
      await writeTokens(next);
      return next.accessToken;
    } catch {
      await SecureStore.deleteItemAsync(tokenKey);
      return undefined;
    }
  }

  return {
    getAccessToken,
    async getSession(): Promise<AuthenticatedSession | null> {
      if (!(await getAccessToken())) return null;
      const session = await getClient().getSession();
      if (!session) await SecureStore.deleteItemAsync(tokenKey);
      return session;
    },
    async signIn(): Promise<void> {
      const discovery: DiscoveryDocument = {
        authorizationEndpoint: installation.authorization_endpoint,
        tokenEndpoint: installation.token_endpoint,
      };
      const request = new AuthRequest({
        clientId: installation.client_id,
        redirectUri,
        responseType: ResponseType.Code,
        scopes: installation.scope.split(/\s+/).filter(Boolean),
        usePKCE: true,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") return;
        throw new Error("Tilde sign-in did not complete");
      }
      const code = result.params.code;
      if (!code || !request.codeVerifier) throw new Error("OIDC callback is incomplete");
      const tokens = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: request.codeVerifier,
        client_id: installation.client_id,
        redirect_uri: redirectUri,
      });
      await writeTokens(tokens);
    },
    async signOut(): Promise<void> {
      try {
        await getClient().logout();
      } finally {
        await SecureStore.deleteItemAsync(tokenKey);
      }
    },
  };
}
