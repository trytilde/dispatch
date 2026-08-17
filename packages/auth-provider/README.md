# Auth provider

Owner authentication for OpenBot control surfaces. Tilde is the default OIDC authority; each
installation has its own audience and public PKCE client registration.

## Public API

- `AuthProvider` owns authorization, code exchange, refresh, token verification, and the public
  native-client configuration exposed by the control service.
- `NativeAuthConfiguration` contains only the authorization endpoint, token endpoint, public client
  ID, and requested scope. It never contains tokens, client secrets, or Tilde service credentials.
- `TildeAuthProvider` registers and reconciles the installation-specific public client and validates
  audience-restricted owner access tokens.
