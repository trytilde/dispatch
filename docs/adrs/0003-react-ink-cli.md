# ADR-0003: React Ink repository CLI

## In brief

- Choose React Ink for human terminal UI. Keep one component model.
- Automation stays direct commands plus JSON. No interactive-only operations.
- Long-running child processes keep inherited stdio. Never trap dev or deploy output.

## Context

Fork owners need an approachable setup and operations experience, while scripts and CI need stable non-interactive behavior. Hand-written terminal strings do not provide a coherent interaction model, but a full-screen application must not become a prerequisite for automation or hide delegated process output.

## Decision

The repository CLI uses React Ink for its interactive launcher, progress feedback, status tables, help, and errors. Every operation remains directly callable, structured commands expose `--json`, and non-interactive output remains deterministic. Commands that delegate to development or deployment scripts briefly render startup feedback and then hand the terminal to the child process with inherited standard streams.

```mermaid
flowchart LR
  O["Fork owner"] --> I["React Ink terminal UI"]
  A["Automation"] --> J["Direct command and JSON"]
  I --> C["Shared command operations"]
  J --> C
  C --> P["Inherited child process stdio"]
```
