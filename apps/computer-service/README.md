# @openbot/computer-service

The capability-protected ConnectRPC server that runs inside an OpenBot Computer image. It executes lifecycle bundles, bounded commands and file operations, desktop input and screenshots, port discovery, and VNC tunneling for computer-provider adapters.

## Public API

This package is a service executable and declares no importable package exports. Its network contract is `@openbot/computer-service-proto`, mounted under `/rpc`; the listening port is `OPENBOT_COMPUTER_SERVICE_PORT` or `4101`.

This service is internal to the computer boundary. The web and desktop applications do not call it directly.
