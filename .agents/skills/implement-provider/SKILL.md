---
name: implement-provider
description: Add or refactor an OpenBot provider implementation while preserving domain contracts, runtime composition, asset ownership, deployment lifecycles, and contract tests. Use whenever editing an implementation in a provider package, adding a provider, or changing provider-specific build, deploy, initialization, prompt, or tool behavior.
---

# Implement an OpenBot provider

Keep provider-specific behavior behind its domain core contract and keep composition outside the adapter. Read the relevant ADRs, core package, implementation, runtime selection, and focused tests before editing.

## Workflow

1. Identify the owning domain and read its `*-provider-core` contract. Do not expose an internal provider interface through RPC unless a user-facing service boundary requires it.
2. Read the matching provider package, configuration composition, and tests. Preserve `ProviderCallContext`, `ProviderError`, cancellation, deadlines, request IDs, and idempotency where the contract defines them.
3. Add the smallest provider-specific implementation. Keep selection in composition code and keep vendor SDK calls inside the adapter.
4. Implement only the optional capabilities the provider supports, such as `Buildable`, `Deployable`, initialization questions, `registerTools()`, or `injectPromptPart()`.
5. Add focused contract and artifact tests, then run the provider package checks before broader repository gates.

## Provider layout

- A small implementation may live at `src/<provider>.ts`.
- When an implementation has multiple responsibilities or owns files used at runtime, use `src/<provider>/index.ts`, cohesive sibling modules, and `src/<provider>/assets/`.
- Export the public implementation from `<provider>/index.ts`, then re-export it from the package root.
- Prefer a file per provider. Split by responsibility, not by arbitrary line count.

## Provider-owned assets

- Store static TypeScript, JavaScript, JSON, service units, plists, shell files, and other generated-file templates as their real file types under `assets/`. Do not embed whole files in TypeScript string literals.
- Resolve assets relative to `import.meta.url`. Build methods must copy or bundle every required asset into their ignored deployment artifact.
- Render only dynamic fragments or placeholders. Escape values for the target format and fail on unresolved placeholders.
- Exclude executable TypeScript templates under `assets/` from the provider package typecheck when placeholders make them intentionally incomplete.
- Test that materialized files exist and contain the expected structure. Do not snapshot secrets or deployment credentials.

## Build and deploy providers

- `check()` validates prerequisites without producing the release.
- `build()` creates software artifacts and returns their paths through deployment outputs.
- `plan()`, optional `configure()`, and `deploy()` consume accumulated outputs, environment variables, and secrets. Providers without `Deployable` are skipped by deployment coordination.
- Keep static/bootstrap secrets separate from provider outputs. Never print secret values or write them into public artifacts.

## Vercel providers

- Do not track a root `vercel.json`. Store provider-specific project configuration at `src/vercel/assets/vercel.json`; the Vercel deploy lifecycle materializes it in the ignored artifact root immediately before deployment.
- Store Function sources, `.vc-config.json`, and Build Output API `config.json` as real assets. The build method bundles or copies them into `.vercel/output`.
- Treat `.vercel/output/config.json` as the routing authority for `vercel deploy --prebuilt`; `vercel.json` is project configuration, not a substitute for Build Output configuration.
- Preserve independently built control and agent-service artifacts and run agent function builds concurrently.

## Verification

Run the focused provider tests and typecheck. Audit the diff for embedded whole-file templates, missing asset copies, stale flat-provider imports, secrets, and unrelated generated output. Run `pnpm check` and `pnpm build` when the change affects deployment artifacts or shared contracts.
