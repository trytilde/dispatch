# Sandbox files

Files under `configuration/sandbox/assets/` belong to installation-level sandbox provisioning. `configuration/sandbox/bootstrap.sh`, when present, is an installation-level lifecycle script and must be idempotent and fail fast.

Agent workspace seeds live under `configuration/agents/<id>/sandbox/workspace/**`. One computer is shared across agents, but deployment creates a Linux user and private persistent directory per agent. Provider operations present that directory to its agent as `/workspace`. Seeds are copied only on first registration: editing a seed never changes an already deployed workspace automatically.

OpenBot does not load secrets from repository configuration or copy control-plane credentials into a sandbox. Bootstrap scripts must not depend on OpenAI, Tilde, Vercel, database, or other control-plane credentials.
