# @openbot/computer-service

The API-key-protected ConnectRPC server that runs inside an OpenBot Computer image. It executes lifecycle bundles, agent-scoped commands and file operations, desktop input and screenshots, port discovery, and VNC tunneling.

## Public API

This package is a service executable and declares no importable package exports. Its network contract is `@openbot/computer-service-proto`, mounted under `/rpc`; the listening port is `OPENBOT_COMPUTER_SERVICE_PORT` or `4101`.

Model-facing requests include an agent ID. The service validates it, derives the stable Linux username, enters the agent's private `/workspace` mount, and executes command, file, screenshot, and input processes as that user. Agent tools call this service through the generated typed client. The web and desktop applications do not call it directly.

Every RPC requires `Authorization: Bearer <OPENBOT_COMPUTER_SERVICE_API_KEY>`. Init creates this static key only inside `configuration/secrets.enc.yaml`; deployment installs the same secret into the computer, agent service, and control service without returning it in provider outputs.

The per-agent process launcher starts from an empty, allowlisted environment, so the service key and other computer-service environment variables are not inherited by model-controlled commands.
