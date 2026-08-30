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

## Why headless

Stream and Sendbird ship an engine welded to their backend; gifted-chat and
Flyer ship no engine at all. This package is the missing middle: the state
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

## Contracts pinned in tests

- `__tests__/chatengineSurface.test.ts` — the exact export list, the
  transport method list, the notice codes, limits and retry policy.
- `__tests__/chatengineContract.test.ts` — `describeTransportContract` run
  against the fake and against the KNF adapter over a stubbed backend:
  page order and cursor, idempotent sends, edit/unsend semantics, reaction
  groups, uploads, realtime registration-before-connect, event order,
  unsubscribe, status fan-out.
- `__tests__/chatengineReducers.test.ts` — every reducer.
- `__tests__/chatengineConversation/Composer/Reactions/Typing.test.tsx` —
  the hooks against the fake: echo adoption, resync merge and fresh head,
  room switch, stale-page guard, paging failure latch, receipt gating and
  batching, double-tap-once, retry-racing-the-sweep-once, upload retry
  once, video poster + clip, caps, edit mode, epoch-guarded reactions,
  typing expiry.

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
- **`focused`** — pass the navigation focus flag to `useConversation` /
  `useChatRoom`; only a focused room acknowledges reads.

## Behaviours worth knowing

- The list is **newest-first**. Own sends appear at once as `temp-…` rows
  and are swapped for the server row keeping their key (`clientId`), so a
  rendered bubble never remounts.
- A realtime echo of an own send adopts its temp by `clientId`, falling
  back to content + reply target for backends without the nonce.
- After a reconnect or a network restore the newest page is fetched and
  **merged**; a gap wider than a page restarts from the fresh head.
- Failed sends that can heal (network, timeout, 5xx, 429) are queued,
  persisted (`outbox:<id>`) and retried on tap or on restore — exactly
  once per attempt even when both race. A definitive 4xx keeps the bubble
  failed with a specific notice.
- Read acknowledgements are gated on focus + foreground, batched per
  burst, and flushed when the reader leaves. The volatile realtime mark
  and the durable `markRead` always go together.
- Reactions reconcile in two steps with a per-message epoch; a failure
  reverts only the acting user's membership.
