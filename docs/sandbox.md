# Sandbox files

Agent workspace seeds live only under `configuration/agents/<id>/sandbox/workspace/**`. Global `configuration/sandbox/` assets and bootstrap scripts are unsupported. One computer is shared across agents, but deployment creates a Linux user and private persistent directory per agent. Provider operations present that directory to its agent as `/workspace`. Seeds are copied only on first registration: editing a seed never changes an already deployed workspace automatically.

The authored folder is called `sandbox/` only for compatibility with Eve's project layout. OpenBot runtime terminology uses Computer, including computer-service, computer-provider, environment variables, and tool filenames.

OpenBot does not load secrets from repository configuration or copy control-plane credentials into an agent workspace. Workspace seeds must not contain OpenAI, Tilde, Vercel, database, or other control-plane credentials.
