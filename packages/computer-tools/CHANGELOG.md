# @tryopenbot/computer-tools

## 1.0.0

### Minor Changes

- [#102](https://github.com/trytilde/dispatch/pull/102) [`f8e5609`](https://github.com/trytilde/dispatch/commit/f8e5609b64e2667ee3face424b2d952b081279b7) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add a standalone `AgentAvatar` entry with component-scoped styles for applications that do not use the complete OpenBot interface.

- [`cd77f24`](https://github.com/trytilde/dispatch/commit/cd77f24613ac272843fe68d7493d3ccefac2a35e) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add agent-centric chat workspaces with rich streamed messages and isolated live Computer desktops per agent.

- [#120](https://github.com/trytilde/dispatch/pull/120) [`db20bc5`](https://github.com/trytilde/dispatch/commit/db20bc531bb246b3962a79e2d7c58a1d6620a0a3) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add automatic memory recall, owner-managed facts, and a least-privilege Memory Catcher synthesizer to OpenBot bots.

- [#71](https://github.com/trytilde/dispatch/pull/71) [`983eb35`](https://github.com/trytilde/dispatch/commit/983eb352c39fee4fabfe45116b4ee9dcda4c5c28) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add optional local and Vercel-hosted ChatGPT subscription inference with Codex device-code authentication, provider-owned agent templates and deployment assets, AI SDK 7 support, resumable staged init selectors that immediately configure the selected provider while offering every built-in alternative, checkout-scoped gitignored user configuration, and correct separation of provider-managed and team-owned Tilde registry membership.

- [#115](https://github.com/trytilde/dispatch/pull/115) [`3c85b64`](https://github.com/trytilde/dispatch/commit/3c85b6488802a0e3f002311949fe40d42dbe824a) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add Codex, Claude Code, and Cursor hook adapters that record searchable ChatKit messages and canonical tool executions while `openbot plugin` installs Tilde MCP servers and skills.

- [#66](https://github.com/trytilde/dispatch/pull/66) [`b9a66cb`](https://github.com/trytilde/dispatch/commit/b9a66cba146cccfc971589b6149603f4085edb3e) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Make Cua Driver the Computer's programmatic GUI backend, expose its runtime catalog as direct local tools, and reconcile canonical and OpenBot computer-use skills for every agent.

- [#69](https://github.com/trytilde/dispatch/pull/69) [`206e39f`](https://github.com/trytilde/dispatch/commit/206e39f523fa2dd5421ab643d58f02ed9dedb8f3) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Run new-agent setup durably in the trusted development Computer and resume its progress after navigation or reload.

- [#97](https://github.com/trytilde/dispatch/pull/97) [`c6c8961`](https://github.com/trytilde/dispatch/commit/c6c8961acb9fae887c9839138f8245f15ee8d6c1) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add a single-VM exe.dev runtime with a host-native Computer, trusted development mode, public noVNC routing, and repository-scoped Code Storage Git with optional GitHub sync.

- [#151](https://github.com/trytilde/dispatch/pull/151) [`9dced8e`](https://github.com/trytilde/dispatch/commit/9dced8ef7e070e517e6177c456a73d0d9c12668b) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Accept `runtime: exe-dev` and preseeded `AI_GATEWAY_API_KEY` / `CODE_STORAGE_REPOSITORY_TOKEN` in non-interactive init, let a fork composition root share one memory bank, skill registry, and connectors MCP server across its agents and decide their reach through `TildeAgentProvider` options (owner defaulting to the user Tilde records on the provisioned bundle, overridable with `OPENBOT_OWNER_USER_ID`), and turn each agent's Chrome on the Computer into a self-hosted Tilde browser runtime with the `EnsureBrowserSession` RPC and `browser_session` tool.

- [#118](https://github.com/trytilde/dispatch/pull/118) [`8e98d8f`](https://github.com/trytilde/dispatch/commit/8e98d8f28ebbe4e0339b2e95641a0d85dc5aed2e) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Show participant joins and leaves as lightweight session activity while keeping them out of the message transcript.

- [#70](https://github.com/trytilde/dispatch/pull/70) [`8fb0d80`](https://github.com/trytilde/dispatch/commit/8fb0d809f1eef9cac06d569d0ed0a223de4f6dbf) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add the initial settings catalogue for browsing and assigning tools and skills to bots.

- [`2b0d90c`](https://github.com/trytilde/dispatch/commit/2b0d90c5ebbc457a2cfe2badafa7ad30dd0cb0e4) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add team-scoped Tilde sign-in, browser sessions, and secure desktop token refresh for OpenBot installations.

- [#95](https://github.com/trytilde/dispatch/pull/95) [`c7d2c11`](https://github.com/trytilde/dispatch/commit/c7d2c11ed668bcbd58386ca89b3869c16523d546) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Provision each authored agent through Tilde's durable Agent Resource Bundle API with a stable machine-user profile, uploaded avatar, default memory bank, safe credential rotation, and human-owned creation followed by machine reconciliation.

- [`c75b77d`](https://github.com/trytilde/dispatch/commit/c75b77d4c8f1940a5ce787a6e3c03e32b9abd659) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Collapse Tilde agent, skill, registry, MCP, and tool reconciliation into one `AgentProvider` lifecycle, and replace the owner-facing Chat Provider and ConnectRPC projection with the native Tilde REST/SSE bridge.

- [#108](https://github.com/trytilde/dispatch/pull/108) [`c7f18ef`](https://github.com/trytilde/dispatch/commit/c7f18ef9fba0675311d342dc7e80bf097f9ff905) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Use native Tilde plugin, connector, routine, and signal resources through one authenticated allowlisted bridge, and remove the corresponding control-service route APIs.

  Plugin inventory now pages Tilde's native MCP, skill, provider, and registry collections directly; it no longer depends on Tilde's OpenBot-specific aggregate catalogue or its first-page limit.

  Routines now consume Tilde's native trigger/version contract, and signal history uses native trigger IDs while accepting legacy rule IDs during the migration window. Signal provider and instance inventories follow every continuation token.

  Development agent creation retains the completed source-generation result until asynchronous Tilde bundle provisioning becomes active, so queued provisioning no longer turns the next status poll into “job not found”.

  Fresh installations and future agents now explicitly select ChatKit `agentLoop` response mode, matching the required SDK endpoint contract.

  The ChatKit credential bridge now permits only the workspace, queue, observation, and attachment operations used by Client Runtime instead of forwarding the complete ChatKit namespace.

  Migration:

  - Replace direct calls to `/api/plugins`, `/api/connectors`, `/api/routines`, and `/api/signals` with `@tryopenbot/client-runtime`.
  - Replace `registerConnectorRoutes` with `registerConnectorAuthorizedRoute` when constructing a custom control service.

- [#116](https://github.com/trytilde/dispatch/pull/116) [`ee6dc62`](https://github.com/trytilde/dispatch/commit/ee6dc622b6b5078bfa1306b19e0c41057e473b81) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add OpenCode and Gemini CLI adapters that record searchable ChatKit messages and canonical tool executions while `openbot plugin` installs their native audit integrations.

- [#80](https://github.com/trytilde/dispatch/pull/80) [`e8df3ca`](https://github.com/trytilde/dispatch/commit/e8df3cab93505bb092ee426c539175f9525d60f8) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add bot-scoped tool and skill management, durable live conversation activity, atomic bot setup presentation, and an Electron Computer preview to the owner workspace.

- [#94](https://github.com/trytilde/dispatch/pull/94) [`7e6185b`](https://github.com/trytilde/dispatch/commit/7e6185b4eb44be4a575528866821b4fe6808f22d) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add a consolidated OpenBot runtime deployment, direct secure ChatKit workspace streaming, persisted unified routines, and bulk tool assignment.

- [#97](https://github.com/trytilde/dispatch/pull/97) [`c6c8961`](https://github.com/trytilde/dispatch/commit/c6c8961acb9fae887c9839138f8245f15ee8d6c1) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add a persistent exe.dev single-VM runtime with Code Storage deployment, host Computer desktops, and explicit reconciliation recovery controls.

- [#76](https://github.com/trytilde/dispatch/pull/76) [`52cce4c`](https://github.com/trytilde/dispatch/commit/52cce4ccda162f64cbd5ac4e74e6fa784138dce7) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Expose the authenticated owner's display name, avatar, organization, and workspace through the shared session contract.

- [`c7927b4`](https://github.com/trytilde/dispatch/commit/c7927b43a71551b8a4d4428a7528ecf650b399e8) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add the complete reusable OpenBot workspace component system, exact light palette, motion curves, agent identity artwork, continuous chat composition, rich message content, activity surface, and Computer pane to `@tryopenbot/ui`.

- [#73](https://github.com/trytilde/dispatch/pull/73) [`a6a7913`](https://github.com/trytilde/dispatch/commit/a6a791320bfbd636f92ee658b58a27cb1d20cefc) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Move the Tilde TypeScript SDK into the OpenBot monorepo under the `@trytilde/sdk*` package names and add Tilde authentication, state, tunnel, plugin, and SDK workflows to `openbot`.

  Migration:

  - Replace `@trytilde/harness-sdk*` imports with the corresponding `@trytilde/sdk*` package.
  - Replace `@trytilde/harness-plugins` and coding-agent wrapper binaries with `openbot plugin`.
  - Replace `tilde auth|state|tunnel` with `openbot auth|state|tunnel`.

- [#129](https://github.com/trytilde/dispatch/pull/129) [`d677077`](https://github.com/trytilde/dispatch/commit/d677077954370423a77502f24199bbdacbae76ae) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Meter Memory Catcher synthesis through durable hosted inference billing.

- [#96](https://github.com/trytilde/dispatch/pull/96) [`1784f6c`](https://github.com/trytilde/dispatch/commit/1784f6cc0b4552eb11b615b82d71e2190e7ba2e6) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Migrate OpenBot to Tilde's regular ChatKit activity, agent, session, message, search, turn, and realtime-ticket REST routes while preserving the ChatKit realtime contract.

  Migration:

  - Replace `OpenBotClient.getBootstrap` with `OpenBotClient.getActivity`.
  - Read the agent page from the activity response's `activity` field.

- [#63](https://github.com/trytilde/dispatch/pull/63) [`608839d`](https://github.com/trytilde/dispatch/commit/608839db733e8c5b023ca13087ffea0c8970cc83) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add shared queued-turn controls and native owner-client parity for onboarding, rich chat, attachments, and Computer takeover.

- [`a1aecaf`](https://github.com/trytilde/dispatch/commit/a1aecaf7f691a6f4fff4f79905b57171ab4ad506) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Separate chat APIs from agent provisioning, remove unused model-facing provider
  hooks, and keep authored agents independent through direct SDK integrations and
  non-provider runtime helpers.

- [`c5df8df`](https://github.com/trytilde/dispatch/commit/c5df8df5e0244d45c80deba036ce780c94cfc3b8) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Reconcile authored agents, skills, tools, services, and Computers through idempotent provider lifecycles in development and deployment.

- [`a865749`](https://github.com/trytilde/dispatch/commit/a865749af593eabe061bb33d137338e17ed78216) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Refine the owner workspace into a continuous per-agent chat with the reference light palette, patterned agent avatars, message replies, file composition, and Tilde connector authorization cards.

- [#110](https://github.com/trytilde/dispatch/pull/110) [`251c0c0`](https://github.com/trytilde/dispatch/commit/251c0c01cb513e9f55168d69fb6977d8b17d9ad4) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Remove the paused Expo mobile client, Android/iOS tooling, EAS publication workflow, and `openbot mobile` command group from main. The complete implementation remains preserved on the `codex/mobile-archive` DO NOT MERGE branch.

  Migration:

  - Stop invoking `openbot mobile`, mobile root scripts, Metro/adb tunnels, or `mobile-v*` releases.
  - Use the web workspace or Electron desktop client while the product foundation is stabilized.

- [#101](https://github.com/trytilde/dispatch/pull/101) [`e8f9fdf`](https://github.com/trytilde/dispatch/commit/e8f9fdf47399893bcf50dfb35eb67fb302e74e68) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Replace the owner-chat transport with typed ChatKit workspace and realtime contracts, including per-user read state and explicit queue and turn lifecycle events.

- [#68](https://github.com/trytilde/dispatch/pull/68) [`c2b115e`](https://github.com/trytilde/dispatch/commit/c2b115ec173991e6403cbd10fa9d408705b4862a) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Replace the Computer's Openbox desktop with a focused XFCE session and permanent Files and browser launchers.

### Patch Changes

- [#147](https://github.com/trytilde/dispatch/pull/147) [`add92f5`](https://github.com/trytilde/dispatch/commit/add92f582f82ccd227615e87e4ec6e6dd551769a) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Recognize Tilde's service-unavailable prefix on the retryable memory-binding checkpoint.

- [#106](https://github.com/trytilde/dispatch/pull/106) [`a200646`](https://github.com/trytilde/dispatch/commit/a2006462dc4963669cad3bc04f1192bcb2b4c763) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add canonical ChatKit registration and execution reporting for local Vercel AI SDK tools, including first-class dynamic child correlation, and enable it in generated OpenBot agents.

- [#72](https://github.com/trytilde/dispatch/pull/72) [`ce97171`](https://github.com/trytilde/dispatch/commit/ce97171a95681822b4355540fb4f8469fe4969f9) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Bound concurrent Tilde skill and tool reconciliation while preserving input order and deterministic errors.

- [#104](https://github.com/trytilde/dispatch/pull/104) [`63ac27b`](https://github.com/trytilde/dispatch/commit/63ac27b41d8ea94fb88a64baf5789f035bfc5086) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Build `@tryopenbot/ui` artifacts when the package is installed directly from Git.

- [#82](https://github.com/trytilde/dispatch/pull/82) [`a99315c`](https://github.com/trytilde/dispatch/commit/a99315c1731a87ec7850ec05c240b14459d84c8a) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Add atomic bulk MCP server function mapping methods and use one request when reconciling an agent's Tilde control-plane toolkit.

- [#135](https://github.com/trytilde/dispatch/pull/135) [`892f44c`](https://github.com/trytilde/dispatch/commit/892f44c9ea8dae7b4776238689d7d7c7817d9def) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep the scoped Code Storage repository authoritative inside trusted exe.dev runtimes.

- [#77](https://github.com/trytilde/dispatch/pull/77) [`d6bee5c`](https://github.com/trytilde/dispatch/commit/d6bee5c23ee5d74d1c0ac3cf899fa052034d30cc) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep newly created bots on the local-runtime tunnel until their complete agent template is ready, reconcile independent Tilde resources concurrently behind a shared request ceiling, and keep managed skill and tool assignments idempotent.

- [#69](https://github.com/trytilde/dispatch/pull/69) [`206e39f`](https://github.com/trytilde/dispatch/commit/206e39f523fa2dd5421ab643d58f02ed9dedb8f3) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep agent activity, streamed messages, previews, and unread state updating while another chat is active.

- [#117](https://github.com/trytilde/dispatch/pull/117) [`4261e8c`](https://github.com/trytilde/dispatch/commit/4261e8c45e93fd360ee0cdf2c1734cdb8eb0577d) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Switch an existing exe.dev checkout to the requested deployment branch before fast-forwarding it.

- [#145](https://github.com/trytilde/dispatch/pull/145) [`47d3725`](https://github.com/trytilde/dispatch/commit/47d372565423995def42543fff97753ab201e66f) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep exe.dev Code Storage reconciliation independent from non-exported environment fields.

- [#45](https://github.com/trytilde/dispatch/pull/45) [`b10e4ca`](https://github.com/trytilde/dispatch/commit/b10e4ca458c43bb36783770c68d9ab77bb7c4db8) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep local browser authentication on the Vite origin and reconcile loopback OAuth callbacks during development.

- [#103](https://github.com/trytilde/dispatch/pull/103) [`502a30a`](https://github.com/trytilde/dispatch/commit/502a30afc11e0997c37cc401f5d8897c12c7de4d) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Allow cookie-authenticated requests through a host-matched HTTPS development proxy without weakening origin checks.

- [#67](https://github.com/trytilde/dispatch/pull/67) [`8097727`](https://github.com/trytilde/dispatch/commit/80977279b1698672f86155fcaf3281b4cd77a701) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep the transcript loading skeleton, scroll-to-bottom control, and Electron drag regions stable across themes and workspace states.

- [#63](https://github.com/trytilde/dispatch/pull/63) [`a31a666`](https://github.com/trytilde/dispatch/commit/a31a66694f8ebc8a875051586a7bc0dd98966840) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Improve local diagnostics, preserve chat state while loading, and refine the workspace composer, steering queue, rich media, typography, sizing, and resize behaviour.

- [#83](https://github.com/trytilde/dispatch/pull/83) [`1ffa4df`](https://github.com/trytilde/dispatch/commit/1ffa4dfaf81152d7aac6819a1cccd33a58052811) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Restore the floating bottom-right Computer preview in web and desktop workspaces.

- [#113](https://github.com/trytilde/dispatch/pull/113) [`c056ada`](https://github.com/trytilde/dispatch/commit/c056ada489de46244b1f5a4298e531d3f52f356e) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Improve mobile navigation, settings, dialogs, search results, and chat composer behavior.

- [#112](https://github.com/trytilde/dispatch/pull/112) [`6cbc0b8`](https://github.com/trytilde/dispatch/commit/6cbc0b8aaa3d0cb83d1e4dc917438f92429019bd) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Make the web workspace mobile-friendly with a slide-out navigation sheet, touch-sized controls, safe-area spacing, and a composer that keeps Enter available for new lines on touch devices.

- [#144](https://github.com/trytilde/dispatch/pull/144) [`83d52e1`](https://github.com/trytilde/dispatch/commit/83d52e1468084e41499645b6ca7b036cf623f055) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Keep Code Storage credentials out of persistent Git remote URLs while preserving unattended reconciliation.

- [#114](https://github.com/trytilde/dispatch/pull/114) [`876d7db`](https://github.com/trytilde/dispatch/commit/876d7db12dbf8c18dee3bbc51aba4484908df03c) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Polish the mobile composer and account menu, deduplicate provider cards, resolve trusted icons, cache plugin catalogues, and add end-user routine provider and routine management settings.

- [#74](https://github.com/trytilde/dispatch/pull/74) [`b1a2840`](https://github.com/trytilde/dispatch/commit/b1a284054b6b166e1409748d9b92faca4ce86bca) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Discover current managed Cua skills and Vercel credentials after provider resources are reprovisioned.

- [#146](https://github.com/trytilde/dispatch/pull/146) [`1477c61`](https://github.com/trytilde/dispatch/commit/1477c61c2005fe91a50817ba980bc7c57605ead6) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Allow bounded Agent Resource Bundle polling while memory bindings finish synchronizing.

- [#64](https://github.com/trytilde/dispatch/pull/64) [`c9e839d`](https://github.com/trytilde/dispatch/commit/c9e839d33c664508ae13c25d48e76428ef09bcce) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Show every public top-level `openbot` command in the interactive launcher.

- [#78](https://github.com/trytilde/dispatch/pull/78) [`2a4bbfc`](https://github.com/trytilde/dispatch/commit/2a4bbfcd14ffb0643c3f6ddb25c44fdf1aa89e8c) Thanks [@danielblignaut](https://github.com/danielblignaut)! - Wait for an active Computer desktop session before running CUA actions and report readiness consistently through Computer tools.

- Updated dependencies [[`add92f5`](https://github.com/trytilde/dispatch/commit/add92f582f82ccd227615e87e4ec6e6dd551769a), [`f8e5609`](https://github.com/trytilde/dispatch/commit/f8e5609b64e2667ee3face424b2d952b081279b7), [`5b0c812`](https://github.com/trytilde/dispatch/commit/5b0c81228af72d9461534285698deb2732646449), [`cd77f24`](https://github.com/trytilde/dispatch/commit/cd77f24613ac272843fe68d7493d3ccefac2a35e), [`d134cd6`](https://github.com/trytilde/dispatch/commit/d134cd63b55e11e39d09b774aa401a3431eb4a5f), [`db20bc5`](https://github.com/trytilde/dispatch/commit/db20bc531bb246b3962a79e2d7c58a1d6620a0a3), [`5bf5b63`](https://github.com/trytilde/dispatch/commit/5bf5b63f4992761950577af4787fc7d983bdd0ec), [`c99e757`](https://github.com/trytilde/dispatch/commit/c99e757c371517cf7c2d26ea448303b76614dc6e), [`2156336`](https://github.com/trytilde/dispatch/commit/2156336d885f78a8b0d485d69e1c92bbd87c7715), [`ed8e843`](https://github.com/trytilde/dispatch/commit/ed8e843b9ccfc104b7b7fd57266b22c32bc44eb1), [`a200646`](https://github.com/trytilde/dispatch/commit/a2006462dc4963669cad3bc04f1192bcb2b4c763), [`5b0c812`](https://github.com/trytilde/dispatch/commit/5b0c81228af72d9461534285698deb2732646449), [`983eb35`](https://github.com/trytilde/dispatch/commit/983eb352c39fee4fabfe45116b4ee9dcda4c5c28), [`3c85b64`](https://github.com/trytilde/dispatch/commit/3c85b6488802a0e3f002311949fe40d42dbe824a), [`720d07c`](https://github.com/trytilde/dispatch/commit/720d07caf0c1259a15839842644adb7d49684904), [`b9a66cb`](https://github.com/trytilde/dispatch/commit/b9a66cba146cccfc971589b6149603f4085edb3e), [`5b0c812`](https://github.com/trytilde/dispatch/commit/5b0c81228af72d9461534285698deb2732646449), [`5b0c812`](https://github.com/trytilde/dispatch/commit/5b0c81228af72d9461534285698deb2732646449), [`206e39f`](https://github.com/trytilde/dispatch/commit/206e39f523fa2dd5421ab643d58f02ed9dedb8f3), [`5b0c812`](https://github.com/trytilde/dispatch/commit/5b0c81228af72d9461534285698deb2732646449), [`d0aaada`](https://github.com/trytilde/dispatch/commit/d0aaada9ff5c00faba2063410b0fd42855951bda), [`c6c8961`](https://github.com/trytilde/dispatch/commit/c6c8961acb9fae887c9839138f8245f15ee8d6c1), [`25563d9`](https://github.com/trytilde/dispatch/commit/25563d961711e4745d0817c8ed1e353130ff6e80), [`9dced8e`](https://github.com/trytilde/dispatch/commit/9dced8ef7e070e517e6177c456a73d0d9c12668b), [`b97e3b0`](https://github.com/trytilde/dispatch/commit/b97e3b0083d97ced46d7465f9f81b40dd4c43429), [`b4bbd3a`](https://github.com/trytilde/dispatch/commit/b4bbd3a405466ff6d7a5883872b8da75dc654b66), [`8e98d8f`](https://github.com/trytilde/dispatch/commit/8e98d8f28ebbe4e0339b2e95641a0d85dc5aed2e), [`eaaed88`](https://github.com/trytilde/dispatch/commit/eaaed88000343b179e664d6ccfa33a45065a23d2), [`8fb0d80`](https://github.com/trytilde/dispatch/commit/8fb0d809f1eef9cac06d569d0ed0a223de4f6dbf), [`848f821`](https://github.com/trytilde/dispatch/commit/848f821b87f161521a3b862379f27c2a7cc398c9), [`380fbc5`](https://github.com/trytilde/dispatch/commit/380fbc56314485d94b1f8b51296fb854e2bb1550), [`b4bbd3a`](https://github.com/trytilde/dispatch/commit/b4bbd3a405466ff6d7a5883872b8da75dc654b66), [`2b0d90c`](https://github.com/trytilde/dispatch/commit/2b0d90c5ebbc457a2cfe2badafa7ad30dd0cb0e4), [`3e834fe`](https://github.com/trytilde/dispatch/commit/3e834fe854a994e2e408fb6a2ae8262b1d6e2524), [`c7d2c11`](https://github.com/trytilde/dispatch/commit/c7d2c11ed668bcbd58386ca89b3869c16523d546), [`97575c9`](https://github.com/trytilde/dispatch/commit/97575c94fd18c3c99b1aeefa0544ab47638ca85a), [`ce97171`](https://github.com/trytilde/dispatch/commit/ce97171a95681822b4355540fb4f8469fe4969f9), [`63ac27b`](https://github.com/trytilde/dispatch/commit/63ac27b41d8ea94fb88a64baf5789f035bfc5086), [`a99315c`](https://github.com/trytilde/dispatch/commit/a99315c1731a87ec7850ec05c240b14459d84c8a), [`c75b77d`](https://github.com/trytilde/dispatch/commit/c75b77d4c8f1940a5ce787a6e3c03e32b9abd659), [`c7f18ef`](https://github.com/trytilde/dispatch/commit/c7f18ef9fba0675311d342dc7e80bf097f9ff905), [`ee6dc62`](https://github.com/trytilde/dispatch/commit/ee6dc622b6b5078bfa1306b19e0c41057e473b81), [`e8df3ca`](https://github.com/trytilde/dispatch/commit/e8df3cab93505bb092ee426c539175f9525d60f8), [`f464185`](https://github.com/trytilde/dispatch/commit/f4641858b43bcca8318495756f8e5bc17c8d79a4), [`7e6185b`](https://github.com/trytilde/dispatch/commit/7e6185b4eb44be4a575528866821b4fe6808f22d), [`d6f9091`](https://github.com/trytilde/dispatch/commit/d6f90912c7e66b8df710b5aa0013fa764ce55851), [`7864111`](https://github.com/trytilde/dispatch/commit/7864111b64efbd5d2adf177bfaca25ae6fc077c7), [`892f44c`](https://github.com/trytilde/dispatch/commit/892f44c9ea8dae7b4776238689d7d7c7817d9def), [`c6c8961`](https://github.com/trytilde/dispatch/commit/c6c8961acb9fae887c9839138f8245f15ee8d6c1), [`52cce4c`](https://github.com/trytilde/dispatch/commit/52cce4ccda162f64cbd5ac4e74e6fa784138dce7), [`c7927b4`](https://github.com/trytilde/dispatch/commit/c7927b43a71551b8a4d4428a7528ecf650b399e8), [`a151205`](https://github.com/trytilde/dispatch/commit/a151205fde32938f9342e09b63d6ec155a33aa5b), [`d6bee5c`](https://github.com/trytilde/dispatch/commit/d6bee5c23ee5d74d1c0ac3cf899fa052034d30cc), [`206e39f`](https://github.com/trytilde/dispatch/commit/206e39f523fa2dd5421ab643d58f02ed9dedb8f3), [`20c5737`](https://github.com/trytilde/dispatch/commit/20c5737cffa4f165f023b3fdd7f7a59aaa26316e), [`4261e8c`](https://github.com/trytilde/dispatch/commit/4261e8c45e93fd360ee0cdf2c1734cdb8eb0577d), [`47d3725`](https://github.com/trytilde/dispatch/commit/47d372565423995def42543fff97753ab201e66f), [`0c99101`](https://github.com/trytilde/dispatch/commit/0c99101c84c07441e1bb1eb94a684b7bb56872b1), [`b10e4ca`](https://github.com/trytilde/dispatch/commit/b10e4ca458c43bb36783770c68d9ab77bb7c4db8), [`39e8b62`](https://github.com/trytilde/dispatch/commit/39e8b62d175e52bf644d92989fcb8e7505e1095e), [`502a30a`](https://github.com/trytilde/dispatch/commit/502a30afc11e0997c37cc401f5d8897c12c7de4d), [`8097727`](https://github.com/trytilde/dispatch/commit/80977279b1698672f86155fcaf3281b4cd77a701), [`a31a666`](https://github.com/trytilde/dispatch/commit/a31a66694f8ebc8a875051586a7bc0dd98966840), [`1ffa4df`](https://github.com/trytilde/dispatch/commit/1ffa4dfaf81152d7aac6819a1cccd33a58052811), [`a6a7913`](https://github.com/trytilde/dispatch/commit/a6a791320bfbd636f92ee658b58a27cb1d20cefc), [`26d0e7a`](https://github.com/trytilde/dispatch/commit/26d0e7abbd7c99decd17fbe961dc62943320720e), [`c056ada`](https://github.com/trytilde/dispatch/commit/c056ada489de46244b1f5a4298e531d3f52f356e), [`6cbc0b8`](https://github.com/trytilde/dispatch/commit/6cbc0b8aaa3d0cb83d1e4dc917438f92429019bd), [`83d52e1`](https://github.com/trytilde/dispatch/commit/83d52e1468084e41499645b6ca7b036cf623f055), [`d677077`](https://github.com/trytilde/dispatch/commit/d677077954370423a77502f24199bbdacbae76ae), [`1784f6c`](https://github.com/trytilde/dispatch/commit/1784f6cc0b4552eb11b615b82d71e2190e7ba2e6), [`608839d`](https://github.com/trytilde/dispatch/commit/608839db733e8c5b023ca13087ffea0c8970cc83), [`876d7db`](https://github.com/trytilde/dispatch/commit/876d7db12dbf8c18dee3bbc51aba4484908df03c), [`bd417b1`](https://github.com/trytilde/dispatch/commit/bd417b1d7bb0327c031cc4c11a05dfc11f5cb917), [`c5df8df`](https://github.com/trytilde/dispatch/commit/c5df8df5e0244d45c80deba036ce780c94cfc3b8), [`a865749`](https://github.com/trytilde/dispatch/commit/a865749af593eabe061bb33d137338e17ed78216), [`b1a2840`](https://github.com/trytilde/dispatch/commit/b1a284054b6b166e1409748d9b92faca4ce86bca), [`8e98d8f`](https://github.com/trytilde/dispatch/commit/8e98d8f28ebbe4e0339b2e95641a0d85dc5aed2e), [`251c0c0`](https://github.com/trytilde/dispatch/commit/251c0c01cb513e9f55168d69fb6977d8b17d9ad4), [`393de57`](https://github.com/trytilde/dispatch/commit/393de57f2e318a36b4fbf8c9b552d8acb0c50b78), [`e8f9fdf`](https://github.com/trytilde/dispatch/commit/e8f9fdf47399893bcf50dfb35eb67fb302e74e68), [`1477c61`](https://github.com/trytilde/dispatch/commit/1477c61c2005fe91a50817ba980bc7c57605ead6), [`c9e839d`](https://github.com/trytilde/dispatch/commit/c9e839d33c664508ae13c25d48e76428ef09bcce), [`8163aff`](https://github.com/trytilde/dispatch/commit/8163aff886bd76300985e0dc7db7201b94a41bbe), [`1e2084f`](https://github.com/trytilde/dispatch/commit/1e2084f0ac32beea9aa9c8293ca092f17af563a0), [`c2b115e`](https://github.com/trytilde/dispatch/commit/c2b115ec173991e6403cbd10fa9d408705b4862a), [`2a4bbfc`](https://github.com/trytilde/dispatch/commit/2a4bbfcd14ffb0643c3f6ddb25c44fdf1aa89e8c)]:
  - @tryopenbot/computer-service-proto@1.0.0
  - @tryopenbot/utilities@1.0.0
  - @trytilde/sdk@0.2.0
  - @trytilde/sdk-vercel-ai-node@1.0.0
