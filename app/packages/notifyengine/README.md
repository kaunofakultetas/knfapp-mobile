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
what the device does. `detach()` never throws and never prompts:
token from memory, then the stored copy, then the device only if
permission is already granted; a failed DELETE keeps the stored token
for the next retry; the whole call is time-boxed for logout.

**Channels** — a declarative, versioned registry. Android freezes a
channel's importance at creation, so changed settings mean a bumped
id (`default.v1` → `default.v2`); the applier diffs, creates,
renames localized names in place, and deletes only ids it has ever
owned. One default channel is guaranteed. Everywhere that is not
Android, the whole module is a silent typed no-op.

**Routing** — a tapped notification becomes one `RouteIntent`
(`{type, data, coldStart, actionId}`) whether the app was warm or
cold. Cold-start responses are consumed exactly once (cleared on the
device and identifier-persisted, so a remount can never replay
navigation); intents arriving before the resolver exists are
buffered and flushed in order. The engine never navigates — the app
registers one resolver and owns the single type→screen map.

**Preferences** — the master switch is client truth in storage
(absent means enabled); channel opt-outs are server truth with
optimistic flips debounced into one merged PUT and a three-way-merge
revert on failure; the chat-preview privacy flag is
optimistic-with-revert. Unknown channel keys are rejected by name
before any write.

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
the ~55-scenario battery: supersede/watchdog races, dedupe and TTL,
detach fallbacks, channel version bumps, exactly-once cold-start
consumption, the three-way preference merge, and the throwing-code
isolation rails.
