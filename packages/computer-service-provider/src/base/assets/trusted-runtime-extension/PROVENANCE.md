# Tilde trusted browser runtime extension

Vendored copy of the Tilde trusted-runtime Chrome extension that Tilde otherwise uploads into
Browserbase sessions. The Computer image and the host Computer install it unchanged at
`/opt/openbot/trusted-runtime-extension`; `openbot-browser` loads it as the only extension of every
agent's Chrome, and computer-service bootstraps it over the loopback DevTools port when
`EnsureBrowserSession` runs.

- Source repository: `trytilde/api`
- Source path: `crates/browser/trusted-runtime-extension/`
- Source commit: `e52c1bd7b`
- Files: `manifest.json`, `service_worker.js`, `content_script.js` (byte-identical; no local edits)

The extension never receives Tilde credentials at build time. The runtime token is injected into the
service worker's global scope by the bootstrap; only the tenant fields (`apiBaseUrl`, `orgId`,
`teamId`, `sessionId`) persist to extension storage. Refresh this directory by copying the same
three files from a newer `trytilde/api` commit and updating the commit above; do not patch them
locally, so `fill_browser_form` and the plugin-events protocol stay identical to Browserbase runs.
