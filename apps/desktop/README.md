# @openbot/desktop

The Electron desktop shell for the OpenBot web UI and local control service. Privileged Node.js behavior remains in Electron main/preload code behind a narrow bridge; the renderer stays browser-compatible.

## Public API

This package is an Electron application and declares no importable package exports. It starts the packaged local control service, loads the same-origin web surface, and exposes only the preload bridge required by that UI.
