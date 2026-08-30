# chatengine

A headless chat engine for React Native / Expo: history paging, optimistic
sends with an offline outbox and retries, edits, unsends, reactions, read
receipts and typing — behind one `ChatTransport` interface. It owns no
backend and draws no pixels: an adapter implements the transport for your
server, a UI (this repo's `@knf/chatuikit`, or anything structurally
compatible with `ChatMessage`) renders what the hooks hand it.

```tsx
import { ChatEngineProvider, useChatRoom } from '@knf/chatengine';

<ChatEngineProvider
  transport={transport}          // your ChatTransport (see Adapters)
  currentUser={{ id, displayName, avatarUrl }}
  storage={AsyncStorage}         // outbox + drafts; default in-memory
  notify={(n) => toast(t(keys[n.code]))}   // codes, never strings
  onNetworkRestore={onNetworkRestore}      // subscribe(cb) → unsubscribe
  makeVideoPoster={extractPoster}          // optional: uri → { uri, width, height }
  limits={{ maxMessageLength: 5000 }}      // optional overrides
>
  …
</ChatEngineProvider>

function Room({ id, focused }) {
  const { conversation, composer, reactions, typingUsers } = useChatRoom(id, { focused });
  // conversation.messages (newest first), composer.sendMessage(), composer.attach(asset),
  // composer.startEdit(m), reactions.reactTo(id, '👍'), typingUsers…
}
```

## Examples

- **`example/ExampleRoom.tsx`** — the engine driving a bare React Native
  UI (a `FlatList` and a `TextInput`) over `fakeTransport`: no server, no
  UI kit, no host. Every hook output a UI consumes is used; a pretend
  friend types and answers, so echo dedupe, receipts and typing run for
  real. Paste it into a blank Expo project to see the engine alone.
- **`example/ExampleAdapter.ts`** — a `ChatTransport` for a generic
  REST + WebSocket backend (routes listed at the top of the file), with
  `fetch` and the socket injectable. `example/__tests__/exampleAdapter.contract.test.ts`
  is the whole recipe for proving an adapter: an in-memory stub of the
  backend, a harness, one `describeTransportContract` call.
- **Kit + engine together** — `packages/chatuikit/example/ExampleRoom.tsx`
  is the reference pairing with `@knf/chatuikit`: two providers, the
  timeline built from `conversation.messages`, every kit callback answered
  by an engine action.

## Why headless

Hosted chat SDKs ship an engine welded to their own backend; pure UI kits
ship no engine at all. This package is the missing middle: the state
logic every chat needs (echo dedupe, resync after a drop, an outbox that
survives restarts, receipt promotion, epoch-guarded reactions) written once
against an interface, so changing the backend is writing an adapter — not
touching a hook. The interface is small on purpose:

```ts
interface ChatTransport {
  fetchMessages(conversationId, { before?: { createdAt, id }, limit? }): Promise<MessagesPage>;
  sendMessage(conversationId, outgoing): Promise<ChatMessage>;   // outgoing.clientId is the idempotency key
  editMessage(conversationId, messageId, text): Promise<{ id, text, editedAt }>;
  deleteMessage(conversationId, messageId): Promise<void>;
  setReaction(conversationId, messageId, emoji): Promise<ReactionGroup[]>;
  removeReaction(conversationId, messageId): Promise<ReactionGroup[]>;
  markRead(conversationId): Promise<void>;
  upload(asset): Promise<UploadResult>;
  fetchChanges?(conversationId, since): Promise<{ messages, cursor }>;  // optional: edits/unsends since a page cursor
  realtime: {
    connect(): Promise<boolean>; status(); onStatus(cb);
    subscribe(cb: (event: ChatEvent) => void);    // one discriminated union
    join(conversationId); typing(conversationId, active); markRead(conversationId);
  };
}
```

Adapters speak the engine's domain types (`ChatMessage`, `ReactionGroup`,
`ChatEvent`) — the engine never sees a wire shape. `isOwn` and `bySelf` are
derived by the engine from `currentUser`, so an adapter does not need to
know who is looking.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the domain model), `transport.ts` (the contract, events, notice codes), `errors.ts` (`TransportError`, the retry policy), `reducers.ts` (every list transition as a pure function), `outbox.ts` (queue + draft persistence), `time.ts` (`parseStamp`), `activeConversation.ts` |
| `provider/` | `ChatEngineProvider` / `useChatEngine`, `KeyValueStorage` + `memoryStorage` |
| `hooks/` | `useConversation`, `useComposer`, `useReactions`, `useTyping`, `useChatRoom` |
| `adapters/knf/` | The KNF Flask + Socket.IO adapter: `createKnfTransport({ http, socket })`, `createKnfSocket`, the wire types and mappers |
| `testing/` | `fakeTransport()` (in-memory backend with `push`, `fail`, `stall`) and `describeTransportContract()` (the conformance suite) |

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` with the
jest-expo preset and this package's own `babel.config.js` — no host
needed (the host's root jest run picks the same specs up too). Specs sit
beside what they pin; `testing/` (the fake and
the conformance suite) ships, `__tests__` does not (`files` in
package.json).

- `src/__tests__/surface.test.ts` — the exact export list, the transport
  method list, the notice codes, limits and retry policy.
- `src/adapters/knf/__tests__/contract.test.ts` — `describeTransportContract`
  run against the fake and against the KNF adapter over a stubbed backend:
  page order and cursor, idempotent sends, edit/unsend semantics, reaction
  groups, uploads, realtime registration-before-connect, event order,
  unsubscribe, status fan-out.
- `src/core/__tests__/reducers.test.ts` — every reducer.
- `src/hooks/__tests__/use{Conversation,Composer,Reactions,Typing}.test.tsx`
  — the hooks against the fake: echo adoption, resync merge and fresh
  head, room switch, stale-page guard, paging failure latch, receipt
  gating and batching, double-tap-once, retry-racing-the-sweep-once,
  upload retry once, video poster + clip, caps, edit mode, epoch-guarded
  reactions, typing expiry.

To prove your own adapter, call `describeTransportContract('mine', () =>
harness)` in a jest file — the harness gives the suite a transport, the
acting user's id, a `seed(row)` into your stub backend and an `emit(event)`
into your realtime channel.

## What the host supplies

- **`transport`** — an adapter.
- **`currentUser`** — `{ id, displayName, avatarUrl? }` or `null` for a
  guest (history only, no optimistic rows, no acknowledgements).
- **`storage`** — anything with `getItem / setItem / removeItem`
  (AsyncStorage as-is); the engine treats it as a convenience.
- **`notify`** — receives `{ level, code, detail? }`; map `NoticeCode` to
  your strings. Codes: `send_failed`, `send_too_long`, `send_forbidden`,
  `session_expired`, `timeout`, `upload_failed` (detail: image | video |
  file), `upload_too_large` (detail: image | video | file |
  video_duration), `edit_failed`, `delete_failed`, `load_older_failed`,
  `reaction_target_gone`, `reaction_add_failed`, `reaction_remove_failed`.
- **`onNetworkRestore`** — subscribe to "connectivity is back"; the outbox
  sweep and the resync run on it.
- **Pickers** — the engine takes an already-picked `PickedAsset`
  (`composer.attach`); the library and document pickers are device
  concerns and stay in the host (this repo: `hooks/chat/useAttachmentPicker.ts`).
- **`focused`** and **`atLatest`** — pass the navigation focus flag and
  the list's "reader at the newest end" state to `useConversation` /
  `useChatRoom`; only a focused room whose reader is at the newest end
  acknowledges reads.

## Behaviours worth knowing

- The list is **newest-first**. Own sends appear at once as `temp-…` rows
  and are swapped for the server row keeping their key (`clientId`), so a
  rendered bubble never remounts.
- A realtime echo of an own send adopts its temp by `clientId`, falling
  back to content + reply target for backends without the nonce.
- After a reconnect or a network restore the newest page is fetched and
  **merged** (unchanged rows keep their identity); a gap wider than a
  page restarts from the fresh head; with a transport that offers
  `fetchChanges`, edits and unsends further up are applied too.
- Failed sends that can heal (network, timeout, 5xx, 429) are queued,
  persisted (`outbox:<id>`) and retried on tap or on restore — exactly
  once per attempt even when both race. A definitive 4xx keeps the bubble
  failed with a specific notice.
- Read acknowledgements are gated on focus + foreground, batched per
  burst, and flushed when the reader leaves. The volatile realtime mark
  and the durable `markRead` always go together.
- Reactions reconcile in two steps with a per-message epoch; a failure
  reverts only the acting user's membership.
- Edits, unsends and reactions that fail on a healable error join a
  persisted task queue (`tasks:<id>`) and replay in order on reconnect
  or network restore.
- A message beyond the loaded history is reached with `jumpTo(id)`: one
  `around` window replaces the held rows. While `hasNewer`, the window
  is detached — arrivals only count for `missedWhileDetached`, read
  acknowledgements hold — until `loadNewer` walks pages back to the
  head or `returnToLatest` re-fetches it.
- A backend that unfurls links after the send patches the row through
  the `updated` event (`message.linkPreview`).
- `attachMany` turns a pure multi-photo pick into ONE gallery message
  (each photo uploaded in pick order); a failure anywhere parks the
  whole set for retry. Anything mixed falls back to one message per
  asset.
- A recorded voice note is just `attach({ kind: 'audio', … })`: the
  clip uploads, the send carries it as the attachment with its length
  in `media.duration` (and its bars in `media.waveform`).
- Uploads report their fraction onto the optimistic bubble; a
  retryably parked send re-drives itself twice before waiting for a
  tap or the restore sweep.
- Pins (`usePins` over the optional transport trio), forwarding
  (`forwardPayload`) and disappearing messages (`setMessageTtl`, the
  'conversation' event, the expiry sweep) are all optional transport
  surface — an adapter without them simply hides the features.
