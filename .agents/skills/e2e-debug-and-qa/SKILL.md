---
name: e2e-debug-and-qa
description: Run and inspect OpenBot browser or desktop workflows with the repository Playwright setup. Use for onboarding, setup authentication, chat, provider, sandbox, visual, console, network, or Electron behavior that must be verified on the real surface.
---

# E2E Debug And Q&A

Answer from the running OpenBot surface when static inspection is insufficient.

## Purpose

Use for questions such as:

- Does onboarding work?
- What appears after setup unlock?
- Why does chat, provider setup, or sandbox startup fail in the UI?
- Does local or packaged Electron behavior match the web app?
- Can you capture the visible failure and network evidence?

Use focused unit or HTTP tests for behavior that does not require a browser.

## Required Preflight

```bash
git status --short --branch
pnpm exec playwright --version
```

Review `playwright.config.ts` and the target test. Keep `.env.local`, `.data/`, browser profiles, setup codes, and provider credentials out of output and artifacts.

## Runtime Startup

Preferred deterministic suite:

```bash
CI=1 pnpm test:e2e
```

The checked-in Playwright server uses isolated setup data, disables the desktop shell, and serves the web app at `http://127.0.0.1:4173`.

For manual inspection:

```bash
OPENBOT_NO_DESKTOP=1 pnpm dev
```

`pnpm dev` starts the control server on `127.0.0.1:4100` and web app on `127.0.0.1:4173` by default. It uses Tilde Tunnel only when Tilde credentials are configured. Do not add unrelated wildcard DNS, ngrok, or database services to browser setup.

## Browser Tool Choice

- Use checked-in Playwright tests for deterministic regression coverage.
- Use project-local Playwright for a one-off reproducible probe.
- Use an available browser inspection tool for quick DOM, console, and network inspection.
- Use Electron only when preload, window, packaging, or desktop proxy behavior is part of the issue.

Never depend on global Playwright packages or `NODE_PATH` overrides.

## Browser Workflow

1. Open the affected route.
2. Reproduce the user's exact state and action sequence.
3. Inspect visible state, DOM, console errors, failed requests, and relevant RPC/HTTP responses.
4. Check the backing server or provider only after capturing the browser symptom.
5. Capture before/after screenshots when visual evidence helps.
6. Convert a stable repro into a focused test under `tests/e2e/` when regression coverage is warranted.

For setup tests, use the isolated setup code configured by `playwright.config.ts`; never reveal a developer's generated `.data/local-setup-code`.

## Q&A Rules

Report:

- route and surface tested
- exact observed result
- console or network failures
- test command and pass/fail result
- artifact paths when captured
- what was inferred rather than observed

If the app cannot start, report the shortest decisive error and the missing requirement.

## Debugging Rules

1. Reproduce first.
2. Preserve a sharp pass/fail signal.
3. Test one hypothesis at a time.
4. Verify the fix through the original flow.
5. Run focused server/provider tests when browser evidence crosses those boundaries.

## Cleanup

Stop manually started web, server, Electron, browser, and sandbox processes unless the user asks to keep them running. Do not delete persistent user sandbox or browser data without explicit permission.

## Artifacts

Keep ad hoc screenshots, traces, videos, and HAR files under `/tmp` or the Codex visualization directory. Playwright's ignored `test-results/` may hold failure artifacts during a run. Never commit or stage them unless the user explicitly requests a durable test fixture.

When replying in Codex, reference local media with an absolute path so it renders.

## Validation

After a browser-facing fix, run the smallest relevant Playwright test, then:

```bash
pnpm check
pnpm build
```
