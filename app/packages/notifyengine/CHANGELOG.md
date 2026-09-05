# Changelog

## 1.0.3 — 2026-09-05

Behaviour release — the second review round over the wired
host, every finding fixed and pinned:

- **The session gate** — `NotifyEngineConfig.canRegister`, an
  optional host predicate (sync or async) the token machine
  consults right after runtime support and BEFORE the master
  switch. A guest's register() answers the new typed
  `'unauthenticated'` with zero device calls, zero wire traffic
  and not one store emission; a master-ON while signed out
  records the intent and the later `register('login')` claims
  the token. A throwing gate fails CLOSED. Absent means always
  allowed.
- **The master switch is seeded at init** — `init()` projects
  the stored value into the snapshot before its permission
  poll, so a persisted OFF is visible without a refreshPrefs().
  `refresh()` never writes the switch any more: the snapshot at
  commit time is the session's truth, and a toggle made while
  the GET was in flight (or one the disk failed to record) is
  no longer reverted when the answer lands — success and error
  branch alike.
- **`setChatPreview` answers** — `Promise<boolean>`: true when
  the wire confirmed the requested value, false when the flag
  snapped back (a revert, or a server that answered the other
  value). The stub agrees.
- **The launch tap that arrives warm** — while NO resolver is
  installed and the buffer holds an intent, `consumeInitial()`
  adopts the OLDEST buffered intent as the cold start
  (`coldStart: true`) instead of reading the device; buffered
  intents keep their identifier, so the later device read of
  the same response dedupes to null. With a resolver installed
  the warm path is untouched.
- **Channels** — `ChannelSpec.vibrationPattern` (off/on
  millisecond pairs) rides through the device adapter next to
  `enableVibrate`; the validator rejects an empty, negative or
  non-finite pattern by channel id at build time.
- **The device adapter on web** — `onPushToken` returns a no-op
  unsubscribe on `'web'` and `'unknown'` without subscribing the
  primitive, mirroring supportsRemotePush — no startup warning.
- **Pins** — the `'disabled'` STEP-1 gate from the start (pure
  typed reject, store stays 'idle'; after detach() stays
  'detached'), gate order, the default gate, init seeding from
  '0' / '1' / absent, the mid-flight toggle in both refresh
  branches, the hydrate-vs-toggle race, the chat-preview
  verdict, buffered adoption and its device dedupe, the pattern
  passthrough, the silent web token listener.
- **Battery** — 167 → 194 scenarios across twelve suites.

## 1.0.2 — 2026-09-05

Tests only — nothing under src/ changed but the specs. The
three seams the retired app-level suite used to cover on its
own now live inside the package, where the engine's battery
runs them on every change:

- **The pre-flight gates, pinned at the machine** — a
  registration bouncing off an undeliverable permission or a
  runtime without remote push answers its typed reason with
  zero device calls, zero wire traffic and not one store
  emission (a subscriber sees only the snapshot it was handed
  on subscribe). The detach chain's last two links are
  exercised positively: a stored copy is DELETEd without
  probing the device, and with nothing anywhere plus
  permission granted the device is asked exactly once and its
  token DELETEd with the captured bearer.
- **The device adapter has its own suite** — createExpoDevice
  over a hand-mocked primitive, so no native module boots and
  no import-time token auto-registration runs: supportsRemotePush
  per runtime (web never, the dev shell's Android never, iOS
  always, an unknown OS never), projectId passthrough and the
  .data unwrap, permission normalisation with the provisional
  tier as its own status and unknown → undetermined,
  canAskAgain untouched, the fetch-echo swallow on the token
  listener (a non-string token never reaches the engine), the
  foreground handler bridged onto the four behaviour flags
  with handleError fan-out that a throwing subscriber cannot
  starve, responses reduced to {identifier, actionIdentifier,
  data} with the null default and data left RAW for the
  routing hub, the Android-only channel calls guarded off
  every other platform (sound undefined vs null told apart),
  and the app-active edge.
- **Battery** — 131 → 167 scenarios across twelve suites.

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
