# Architecture decision records

ADRs preserve major architecture, strongly opinionated code, and durable code or product design decisions whose reasoning is not obvious from the code. Use the next sequential filename: `NNNN-short-slug.md`.

Keep each ADR short. Record the decision and why it should survive future cleanup. Add options or consequences only when they help a future reader. Include the smallest useful Mermaid diagram when a boundary, flow, hierarchy, or state transition is involved; omit decorative diagrams.

The `In brief` bullets use caveman style: terse fragments, exact nouns, explicit negation. The rest uses concise normal prose.

## Template

````md
# ADR-NNNN: Short decision title

## In brief

- Choose {decision}. Keep {reason}.
- Boundary stays {owner}. No leak.
- Cost: {main trade-off}. Accepted.

## Context

{What forced this decision and why the answer was not obvious.}

## Decision

{What OpenBot will do, including the important no.}

```mermaid
flowchart LR
  A["Owning boundary"] -->|"defined interaction"| B["Dependent boundary"]
```

## Consequences

- {Important benefit or constraint.}
- {Known cost or follow-up.}
````

Remove sections that add no durable information. Keep `In brief`, `Context`, and `Decision`. Mermaid is expected where it clarifies a real relationship; replace the example rather than copying it unchanged.
