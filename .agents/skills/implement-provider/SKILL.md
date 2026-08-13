---
name: implement-provider
description: Add or refactor an OpenBot provider implementation while preserving domain contracts, runtime composition, asset ownership, deployment lifecycles, and contract tests. Use whenever editing an implementation in a provider package, adding a provider, or changing provider-specific build, deploy, initialization, prompt, or tool behavior.
---

# Implement an OpenBot provider

Keep provider-specific behavior behind its domain core contract and keep composition outside the adapter. Read the relevant ADRs, the owning package's `src/core.ts` or `src/core/index.ts`, implementation, runtime selection, and focused tests before editing. Do not create a separate `*-provider-core` package.

## Workflow

1. Identify the owning domain and read the contract in the provider package's `src/core.ts` or `src/core/index.ts`. Do not expose an internal provider interface through RPC unless a user-facing service boundary requires it.
2. Read the matching provider package, configuration composition, and tests. Preserve `ProviderCallContext`, `ProviderError`, cancellation, deadlines, request IDs, and idempotency where the contract defines them.
3. Add the smallest provider-specific implementation. Keep selection in composition code and keep vendor SDK calls inside the adapter.
4. Implement only the optional capabilities the provider supports, such as `Buildable`, `Deployable`, initialization questions, `registerTools()`, or `injectPromptPart()`.
5. Add focused contract and artifact tests, then run the provider package checks before broader repository gates.

## Provider layout

- Define every domain provider contract interface, such as `AgentProvider`, `ComputerProvider`, `SkillProvider`, or `ToolProvider`, in `src/core.ts`. When the contract needs supporting core modules, use `src/core/index.ts` as its entrypoint instead.
- Re-export the core contract from the package root. Never define a provider contract interface in `src/index.ts`, a concrete adapter file, or a provider-specific directory. Adapter configuration and SDK-specific types stay with their adapter.
- A small implementation may live at `src/<provider>.ts`.
- When an implementation has multiple responsibilities or owns files used at runtime, use `src/<provider>/index.ts`, cohesive sibling modules, and `src/<provider>/assets/`.
- Export the public implementation from `<provider>/index.ts`, then re-export it from the package root.
- Prefer a file per provider. Split by responsibility, not by arbitrary line count.
- Do not add provider descriptors or generic `createProvider(type)` selectors. The fork explicitly imports and constructs concrete implementations under `Configuration({ providers: { ... } })` in `configuration/index.ts`.
- Do not add `health()` or `verify()` to provider interfaces or implementations unless an explicit domain requirement calls for that exact operation. Keep service health endpoints and deployment smoke checks at their owning service/runtime boundary.

## Provider-owned assets

- Store TypeScript, JavaScript, JSON, service units, plists, shell files, and every other generated-file source under `assets/` as Handlebars templates with the target extension followed by `.hbs`, such as `entry.ts.hbs` or `vercel.json.hbs`. Do not embed whole files in TypeScript string literals.
- Resolve templates relative to `import.meta.url` and render them through `@openbot/utilities`. Build and deploy methods must render or bundle every required template into their ignored artifact; do not materialize provider assets with `copyFile()` even when a template is currently static.
- Put assets shared completely by sibling providers under `src/base/assets/`; add provider-specific asset directories only when their contents or control flow actually diverge.
- Use strict templates so missing values fail. Escape values for the target format before rendering. Use ordinary Handlebars expressions for text that needs HTML escaping and triple braces only for deliberately pre-encoded target-language fragments such as `JSON.stringify(...)` output.
- Do not create ad hoc `replaceAll()` renderers, multiline whole-file strings, or alternate template engines.
- Keep runtime persistence, database contents, lifecycle bundle bytes, and user-supplied file contents byte-preserving. They are data, not generated-file templates.
- Exclude executable TypeScript templates under `assets/` from the provider package typecheck when placeholders make them intentionally incomplete.
- Test that materialized files exist and contain the expected structure. Do not snapshot secrets or deployment credentials.

## Build and deploy providers

- `check()` validates prerequisites without producing the release.
- `build()` creates software artifacts and returns their paths through deployment outputs.
- `plan()`, optional `configure()`, and `deploy()` consume accumulated outputs, environment variables, and secrets. Providers without `Deployable` are skipped by deployment coordination.
- Keep static/bootstrap secrets separate from provider outputs. Never print secret values or write them into public artifacts.
- Container images compile their packaged services in a multi-stage build; never copy a host-precompiled `dist` bundle into an image.
- Computer providers expose the capability-protected computer-service transport to the later agent-service deployment. Agent-authored computer tools call that typed service, not Microsandbox or Vercel Sandbox directly; computer-service validates the agent ID, selects `/workspace/<agent-id>` as the relative default, and scopes background jobs. Agents intentionally share the computer process identity and filesystem.

## Vercel providers

- Do not track a root `vercel.json`. Store provider-specific project configuration at `src/vercel/assets/vercel.json.hbs`; the Vercel deploy lifecycle renders it in the ignored artifact root immediately before deployment.
- Store Function sources, `.vc-config.json`, and Build Output API `config.json` as Handlebars assets. The build method renders or bundles them into `.vercel/output`.
- Treat `.vercel/output/config.json` as the routing authority for `vercel deploy --prebuilt`; `vercel.json` is project configuration, not a substitute for Build Output configuration.
- Preserve independently built control and agent-service artifacts and run agent function builds concurrently.

## Verification

Run the focused provider tests and typecheck. Audit the diff for provider contract interfaces outside `src/core.ts` or `src/core/index.ts`, embedded whole-file templates, non-Handlebars generation, raw provider-asset copies, stale flat-provider imports, secrets, and unrelated generated output. Run `pnpm check` and `pnpm build` when the change affects deployment artifacts or shared contracts.
