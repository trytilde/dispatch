# Computer providers

`@openbot/computer-providers` implements the shared OpenBot computer boundary
for Microsandbox and Vercel Sandbox. Both providers use the same OCI image, so
the canonical `Containerfile`, bootstrap script, and startup script live as
Handlebars templates under `src/base/assets/`. The build renders them into the
staged Docker context; provider adapters do not duplicate those assets.

The provider lifecycle stages the computer service source and shared assets in
`.openbot-deploy/computer-images/`, builds and content-tags the image, then
pushes it to `OPENBOT_COMPUTER_IMAGE_REPOSITORY`. Deployment contributes either
`OPENBOT_MICROSANDBOX_COMPUTER_IMAGE` or `OPENBOT_VERCEL_COMPUTER_IMAGE` to the
runtime environment. The image builds `apps/computer-service` in a dedicated
container stage; it never copies a host-precompiled service bundle.

Building or deploying a new image does not mutate, restart, or replace existing
computers. Only computers created after the runtime receives the new image
reference use it. Replacing an existing computer must remain an explicit
lifecycle operation so persistent workspace data is not changed implicitly.

All agents in an installation share one computer. Agent deployment registers a
stable Linux user and private persistent directory for every path-derived agent
ID. Provider operations scope logical `/workspace` paths to that directory and
commands run as the agent's Linux user. Files authored under
`configuration/agents/<id>/sandbox/workspace/**` seed only a newly registered
workspace. Later builds and deploys do not merge, overwrite, or delete files in
an existing agent workspace.
