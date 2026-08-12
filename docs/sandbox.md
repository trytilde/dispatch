# Sandbox files

Files under `configuration/sandbox/assets/` are copied into `/workspace` whenever a sandbox starts or resumes. `configuration/sandbox/bootstrap.sh`, when present, runs afterward from `/workspace` on every start. Make it idempotent and fail fast.

OpenBot does not load secrets from repository configuration or copy control-plane credentials into a sandbox. Bootstrap scripts must not depend on OpenAI, Tilde, Vercel, database, or other control-plane credentials.
