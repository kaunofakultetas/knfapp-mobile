# notifyengine

A headless push-notification engine for React Native / Expo. It owns
the four things every app rebuilds badly — a permission state
machine, a push-token-to-backend lifecycle, tap-to-route intents and
per-feature preferences — behind three injectable seams (transport,
device, storage), so every behavior is testable with the shipped
fakes and no screen ever talks to a native module directly.

```ts
import {
  ChannelImportance, createExpoDevice, createKnfNotifyTransport, createNotifyEngine,
} from '@knf/notifyengine';

const engine = createNotifyEngine({
  transport: createKnfNotifyTransport({ http }),   // your wire
  device: createExpoDevice({ projectId }),          // the native seam
  storage,                                          // any AsyncStorage-shaped key-value store
  // NB: the native scale bottoms out at 3 — that value means a
  // SILENT channel, frozen forever; use the named constants
  channels: [{ id: 'default.v1', nameKey: 'default', importance: ChannelImportance.DEFAULT }],
  presentation: { rules: {}, default: { banner: true, list: true, sound: true, badge: true } },
  language: () => (i18n.language === 'lt' ? 'lt' : 'en'),
  // Optional: who may claim a token. A guest's register() answers
  // {ok:false, reason:'unauthenticated'} without touching the wire
  canRegister: async () => (await session.token()) !== null,
});

await engine.init();                    // idempotent — safe under fast refresh
engine.routing.setResolver(routeMap);   // the ONE type→screen map, app-owned
await engine.register('restore');
```

## The machines

**Permission** — one normalized snapshot on every platform:
`undetermined | granted | provisional | denied | unsupported`, with
`canAskAgain` (false means only OS settings can help) and the single
`canDeliver` flag delivery gates on. `unsupported` is a first-class
state: a runtime that cannot do remote push (the shared development
shell on Android, the web) answers honestly instead of error-looping.
Prompting is single-flight; returning to the foreground re-polls.

**Registration** — `register(reason)` coalesces concurrent calls,
lets a newer call supersede an older one (a generation counter makes
stale completions harmless), re-checks the master switch right
before the POST, dedupes on a persisted `{token, platform, language}`
tuple with a 7-day re-assert TTL — while `'login'` and `'toggle'`
always claim the token fresh — and settles under a watchdog no matter
what the device does. Its pre-flight gates answer in a fixed order
and as pure typed values with zero store writes: `'unsupported'`
(no remote push here), `'unauthenticated'` (the host's optional
`canRegister` said no — a guest flipping the master switch ON
records the intent, and the later `register('login')` claims the
token), `'disabled'` (master off), `'permission'`. A master-off user
bouncing off the gate keeps whatever phase they had, `'detached'`
included. `detach()` never throws and never prompts:
token from memory, then the stored copy, then the device only if
permission is already granted; a failed DELETE keeps the stored token
for the next retry; the whole call is time-boxed for logout.

**Channels** — a declarative, versioned registry. Android freezes a
channel's importance at creation, so changed settings mean a bumped
id (`default.v1` → `default.v2`); the applier diffs, creates,
renames localized names in place, and deletes only ids it has ever
owned. A spec carries `importance`, `vibration`, an optional
`vibrationPattern` (off/on millisecond pairs, validated at build
time), `lightColor` and `sound`. One default channel is guaranteed.
Everywhere that is not Android, the whole module is a silent typed
no-op.

**Routing** — a tapped notification becomes one `RouteIntent`
(`{type, data, coldStart, actionId}`) whether the app was warm or
cold. Cold-start responses are consumed exactly once (cleared on the
device and identifier-persisted, so a remount can never replay
navigation); intents arriving before the resolver exists are
buffered and flushed in order. A launch tap can reach the warm
listener before the launch consumer asks — so while no resolver is
installed, `consumeInitial()` adopts the oldest buffered intent as
the cold start (`coldStart: true`) and the later device read of that
same response answers null. The engine never navigates — the app
registers one resolver and owns the single type→screen map.

**Preferences** — the master switch is client truth in storage
(absent means enabled), seeded into the snapshot by `init()` so a
persisted OFF is visible before any wire round-trip, and never
re-read by `refreshPrefs()` — a toggle made while the GET is in
flight stands; channel opt-outs are server truth with optimistic
flips debounced into one merged PUT and a three-way-merge revert on
failure; the chat-preview privacy flag is optimistic-with-revert,
and `setChatPreview(on)` resolves `true` when the wire confirmed the
requested value, `false` when the flag snapped back. Unknown channel
keys are rejected by name before any write.

**Foreground policy** — one data-driven handler: rules keyed by the
payload's `type`, a `suppress` predicate for "this room is on
screen", an internal deadline inside the OS one, and a safe default
of SHOW when anything misbehaves.

## Testing

`@knf/notifyengine/testing` ships `createFakeDevice()` (scripted
permissions/tokens, emit rotations/responses/app-active, fire the
captured foreground handler), `createFakeTransport()` (in-memory
backend with per-method failure injection and a recorded call log),
`createMemoryStorage()`, named fixtures, and
`describeTransportContract(...)` — the conformance suite any real
transport must also pass before it may be swapped in.

`npm test` inside the package (or the host's root jest run) covers
the 194-scenario battery across twelve suites: the pre-flight gates
in order (runtime, session, master switch, permission), supersede/
watchdog races, dedupe and TTL, the full detach fallback chain,
channel version bumps, exactly-once cold-start consumption and the
buffered launch tap's adoption, the master switch seeded at init and
surviving an in-flight refresh, the three-way preference merge, the
throwing-code isolation rails, and the device adapter's translation
layer over a hand-mocked primitive (runtime support, permission
tiers, the token-echo swallow and its silence off-device, the
foreground bridge, response reduction, Android-only channels with
the vibration pattern).
