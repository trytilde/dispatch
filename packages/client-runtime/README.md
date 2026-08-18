# @tryopenbot/client-runtime

Framework-neutral client behavior shared by OpenBot web, Electron, and Expo clients.

## Public API

- The package root exports the transport client, Zustand vanilla runtime, reducers, and all client contracts.
- `contracts/auth` owns the UI-visible owner session and authentication adapter contract.
- `contracts/sidebar` owns agents, sessions, pagination, and sorting.
- `contracts/messages` owns conversation messages and parts.
- `contracts/events` owns ChatKit SSE event envelopes.
- `contracts/installation` owns control-service health, public native-auth discovery, and the selected installation.
- `contracts/attachments` owns attachment metadata and upload handshakes.
- `contracts/queue` owns queued agent turns.
- `contracts/platform` owns the narrow Electron renderer bridge.

The runtime has no React, DOM, Electron, Expo, or Node dependency. Applications provide authentication, fetch, storage, lifecycle, and native file capabilities at their platform boundary. Tilde remains authoritative for chat resources; these schemas validate only the resource subset consumed by OpenBot clients.
