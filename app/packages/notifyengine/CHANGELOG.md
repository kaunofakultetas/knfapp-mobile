# Changelog

## 1.0.1 — 2026-09-02

The adversarial review round over the fresh core — 26 confirmed
findings, every one fixed and pinned the same day:

- **Registration** — the final commit is generation-guarded
  across every await (a superseded attempt can no longer stamp
  'registered', persist a stale tuple or claim success); the
  watchdog invalidates its attempt so a late device answer
  lands as superseded instead of POSTing behind a failed
  verdict; register and detach serialize BOTH ways; gate
  rejections before anything starts are pure typed results —
  a rotation bouncing off the master switch no longer stamps
  'failed' over 'detached'.
- **The rotation lane uses the DELIVERED token** — never a
  re-acquire: the primitive emits its token event on every
  fetch, and re-acquiring loops forever on real devices; the
  device adapter also swallows its own fetch echoes.
- **Wire truth** — tokenId is the backend's opaque STRING
  (UUIDs; the numeric contract failed every real
  registration); channel bodies are strict — every key a
  boolean or a typed server failure, never fabricated
  all-enabled defaults over a user's opt-outs.
- **Routing** — the consumed-response guard is a RING of
  recent identifiers (one warm tap no longer evicts a sticky
  cold response's marker and replays yesterday's navigation);
  concurrent consumeInitial() calls serialize.
- **Channels** — the delete pass runs only when every
  replacement create landed, so a failed version bump can
  never leave the guaranteed default channel missing.
- **Preferences** — optimistic flips hold visibly through the
  whole flight; refresh() waits out an in-flight PUT; the
  master switch's session intent survives a failing disk.
- **Presentation** — own-property rule lookup (a payload
  typed 'constructor' falls to the default, not the
  prototype); resolved rules are copies.
- **Surface & docs** — ChannelImportance constants (the
  native scale bottoms out at a SILENT 3); MutableStore
  exported; compilable README samples; the conformance suite
  asserts only what fake AND real backends guarantee, and the
  fakes enforce the server's token grammar; a drop-in
  createNotifyEngineStub for app-level tests.

## 1.0.0 — 2026-09-02

The headless notification core, extracted from four app files'
worth of scattered wiring and hardened with the edge cases a
survey of the field's regression suites kept tripping over.

- **Permission machine** — one normalized cross-platform
  snapshot; `unsupported` as a first-class state for runtimes
  without remote push; single-flight prompting; foreground
  re-poll with edge-deduped emissions.
- **Token lifecycle** — coalesced, supersede-safe, watchdog-
  settled registration; tuple dedupe with a 7-day re-assert TTL
  and force-fresh `login`/`toggle` reasons; a `detach()` that
  never throws, never prompts, keeps the stored token after a
  failed DELETE and is time-boxed for logout.
- **Channel registry** — declarative, versioned ids over the
  frozen-at-creation Android reality; ownership-tracked deletes;
  guaranteed default channel; typed no-op elsewhere.
- **Tap routing** — one RouteIntent shape warm or cold;
  exactly-once cold-start consumption (device clear plus a
  persisted identifier); buffer-until-resolver with a cap;
  throwing-resolver isolation; the app owns the one route map.
- **Preferences** — client-truth master switch, server-truth
  channel opt-outs with debounced merged PUTs and a three-way-
  merge revert, optimistic chat-preview flag.
- **Foreground policy** — data-driven rules by payload type,
  crash-safe suppress predicate, internal deadline, safe
  default SHOW.
- **Adapters** — the device seam over the Expo primitive
  (provisional tier surfaced, dev-shell Android honestly
  unsupported) and the faculty backend transport with
  field-validated responses and typed failure codes.
- **Testing doubles** — fake device, fake transport, memory
  storage, fixtures, and the transport conformance suite.
