# ADR 0036: Multiplayer room clients share one runtime contract

Status: Accepted

OpenBot retains the shared client-runtime room contract for durable roster,
roles, invitation lifecycle, departure, typing/presence, and shared session
attachments. The public Tilde SDK remains the supported programmatic surface.
Owner-facing web and shared Electron renderer controls use native team-person
discovery and agent selection; the earlier raw-user-ID invitation UI was not a
shippable identity experience.

Tilde owns membership, admission, authorization, and event audiences. OpenBot
owns presentation and bounded group-turn policy. Client code must not copy a
participant's credential, personal tool, or private memory into shared room
configuration.

<FOLLOW UP>
Owner: OpenBot mobile clients
Trigger: when native mobile multiplayer UX is prioritized
Work: consume the shared session controller for roster, invitation and admission
controls and prove parity with the web renderer.
</FOLLOW UP>

## Updates

- 2026-09-01: Deferred owner-facing multiplayer UI while retaining backend and
  SDK functionality; recorded the identity-discovery requirement for revival.

- 2026-09-07: User-requested header/session controls restore roster, agent addition,
  human invitations and removal through `runtime.session` and shared UI. Human
  candidates use the native team directory via an allowlisted configured-team
  bridge. API nonmembers may request native admission, but only a verified roster
  identity enables messaging. External nonmembers are directed to their source.
  Browser tests cover invitations, renaming, source restrictions and verified
  joins; Electron consumes the same renderer, native packaging is not exercised.

- 2026-09-07: Follow-up replaces the owner invitation UI with runtime-owned
  existing-identity search and direct native participant addition. Candidates
  appear only in a floating autocomplete above the roster. Tilde validates the
  target human's team identity, binds the principal and coordinates visibility
  membership; removing the explicit human revokes that membership. The invitation
  API remains available to other clients.
