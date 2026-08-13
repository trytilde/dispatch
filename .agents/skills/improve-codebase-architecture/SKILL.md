---
name: improve-codebase-architecture
description: Find deepening opportunities in OpenBot's TypeScript monorepo using its provider contracts, protobuf API, control-state ownership, runtime composition, and documented decisions. Use for refactoring, consolidation, testability, or AI-navigability reviews.
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities: more useful behavior behind smaller, stable interfaces.

## Glossary

Use these terms consistently. Full definitions live in [LANGUAGE.md](LANGUAGE.md).

- **Module**: interface plus implementation.
- **Interface**: everything callers must know, including types, invariants, errors, ordering, and configuration.
- **Implementation**: code hidden behind the interface.
- **Depth**: leverage delivered through an interface.
- **Seam**: place behavior can change without editing callers.
- **Adapter**: concrete implementation at a seam.
- **Locality**: related knowledge, changes, and tests concentrated together.

Apply the deletion test: if removing a module only spreads the same complexity across callers, it was useful. If complexity disappears, it was likely pass-through. One adapter is a hypothetical seam; multiple adapters prove one.

## Process

### 1. Explore

Read `README.md`, `AGENTS.md`, relevant protobuf messages/services, provider interfaces, implementation files, tests, and any ADRs. Use `rg` and focused file reads to trace real call paths; do not require subagent delegation.

Look for:

- Connect or Hono handlers owning provider or domain logic.
- UI code branching on provider-specific behavior.
- duplicated local and Vercel runtime decisions.
- database state that belongs to Tilde, environment storage, or a sandbox.
- provider interfaces shaped around one implementation.
- protobuf contracts leaking storage or adapter details.
- tests that mock below the seam where failures occur.
- modules that require edits across many packages for one concept.

### 2. Present candidates

For each candidate provide:

- files
- concrete friction
- proposed ownership or seam
- benefits for locality, leverage, and tests
- compatibility or migration risk

Use OpenBot concepts, not generic placeholders. Do not design interfaces until the user selects a candidate.

### 3. Grilling loop

For the selected candidate, resolve constraints, ownership, lifecycle, failure modes, compatibility, and the test surface one decision at a time.

- Update a glossary only when a durable domain term is resolved.
- Offer an ADR only for a load-bearing, surprising trade-off.
- Amend an existing governing ADR instead of duplicating it, and append the required timestamped `Updates` bullet when its decision changes.
- Preserve Tilde, database, environment, sandbox, web, desktop, and provider boundaries unless the change deliberately redefines one.
- Use [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md) when comparing interface shapes and [DEEPENING.md](DEEPENING.md) for deeper examples.
