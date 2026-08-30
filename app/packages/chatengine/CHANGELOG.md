# Changelog

## 1.5.0 — 2026-08-30

Pins, forwarding, disappearing messages, upload progress, the
self-retry, previews and waveforms.

- **Message pins** — the optional transport trio (`pinMessage` /
  `unpinMessage` / `fetchPins`) and `usePins`: fetched once, refreshed
  by the 'updated' patch every pin flip broadcasts, pruned live on
  unsends. `ChatMessage.pinnedAt/pinnedBy`; `sameRow` compares them.
- **Forwarding** — `forwardPayload(source, clientId)` turns a held row
  (or a host UI row — `ForwardSource` is structural) into the marked
  re-send: content travels, quotes and link cards stay behind.
  `OutgoingMessage.forwarded`, `ChatMessage.forwarded`.
- **Disappearing messages** — the optional `setMessageTtl`, the new
  'conversation' realtime event merging `messageTtlSeconds` into the
  held meta, `ChatMessage.expiresAt`, and the half-minute sweep that
  drops expired rows off the screen between fetches.
- **Upload progress** — `upload(asset, onProgress?)`; the composer puts
  the fraction on the optimistic bubble (`uploadProgress`, galleries
  aggregate photo i of n) and clears it on land or failure.
- **Self-retry** — a retryably parked send re-drives itself (5s, 20s)
  before waiting for a tap or the restore sweep; successes and manual
  retries clear the timers, the counter never resets.
- **Previews** — the backend's ~14px micro copies ride
  `UploadResult.preview` into `media.preview` / gallery items /
  `ChatMessage.mediaPreview` / the link card's `imagePreview`.
- **Waveforms** — `PickedAsset.waveform` → `media.waveform` →
  `ChatAudio.waveform` (up to 64 bars, 0..1).
- **Realtime status** — `useRealtimeStatus` for the connection banner.
- **Conformance** — the contract suite exercises the pin trio when an
  adapter offers it.

## 1.4.0 — 2026-08-30

Voice notes.

- **Kind `audio`** — `ChatMessage.audio` (`ChatAudio`: uri, duration,
  size, mime, name), `'audio'` in `ChatMessageKind`, `OutgoingMessage`
  and `UploadAsset`. `attach()` takes a recorded clip like any picked
  asset: upload with kind=audio, then ONE send — the stored file as
  the attachment, the length in `media.duration`. Outbox retry and
  rehydration carry the clip; `sameRow` compares its uri.
- **Adapters** — the KNF adapter maps `audio` rows both ways; the fake
  transport commits them.

## 1.3.0 — 2026-08-30

Gallery messages.

- **Several photos as ONE message** — `ChatMessage.gallery`
  (`ChatGalleryItem[]`: url + frame), `OutgoingMessage.gallery`, and
  `composer.attachMany(assets)`: a pure multi-photo pick (up to 8)
  uploads each in pick order and sends one message carrying the stored
  list; one pick — or a set with a video / document in it — falls back
  to `attach()` per asset. The optimistic bubble shows the local picks
  from the first frame.
- **Retry** — a failure anywhere parks the WHOLE picked set in the
  outbox (`assets`); tap-to-retry and the restore sweep upload every
  photo again and send once. Rehydrated bubbles show the local picks.
- **Adapters** — the KNF adapter posts `gallery` and maps it back; the
  fake transport commits it; `sameRow` compares the list so a resync
  repaints exactly the rows whose album changed.

## 1.2.0 — 2026-08-30

Offline actions, link previews and jump-to-message.

- **Offline task queue** — edits, unsends and reactions that fail on a
  healable error (network, timeout, 5xx, 429) are persisted
  (`tasks:<conversation>`) and replayed in order on reconnect or
  network restore; a repeated edit keeps the FIRST original text for
  its revert.
- **Link previews** — `ChatMessage.linkPreview` (`ChatLinkPreview`),
  the `updated` realtime event whose patch merges into a held row, and
  the KNF adapter's mapping of `message_updated` and the `linkPreview`
  payload. A resync's `sameRow` compares the preview too, so a card
  appearing repaints exactly its row.
- **Jump-to-message** — `fetchMessages` learned the `around` (anchor
  window) and `after` (forward page) options and `MessagesPage.hasNewer`;
  `useConversation` answers `jumpTo(id)` → `'loaded' | 'anchored' |
  'missing'`, `hasNewer`, `loadNewer`, `loadingNewer`, `returnToLatest`
  and `missedWhileDetached`. Detached, arrivals only count for the
  badge, read acknowledgements hold, and a resync leaves the window
  alone; the page that reaches the head re-attaches and resyncs.
- **Conformance** — the contract suite checks the around/after windows
  (edge flags included) against every adapter; the fake transport and
  both example stubs answer them.
- **Fix** — the KNF adapter dropped `hasNewer` on the floor
  (`toMessagesPage`), so a real backend's window never detached.

## 1.1.0 — 2026-08-30

A review of the engine against production chat clients, and what came
out of it.

- **Change feed** — `ChatTransport.fetchChanges?(conversationId, since)`
  and `MessagesPage.cursor`: a resync now applies edits and unsends made
  while the client was away to every row it holds, not only the newest
  page (`applyChanges`). The fake transport, the conformance suite and
  the KNF adapter (`GET …/changes?since=`) support it.
- **Identity-preserving resync** — `sameRow`: a reconnect keeps the
  known row object when the server brought nothing new, so memoised
  bubbles do not repaint.
- **Read acknowledgements gated on the newest end** —
  `useConversation(id, { atLatest })`; the UI reports it
  (chatuikit's `onAtLatestChange`).
- **Guests** — `composer.canSend`.
- **Assets** — `normalizeAssetName`: the upload's name follows its bytes
  (an iOS `.HEIC` handed over as JPEG becomes `.jpg`).
- **Drafts** — the quoted message is persisted beside the draft
  (`draftreply:<id>`) and restored with it.
- **Dev-time ingest validation** — `validateIngest` warns once per row
  without an id / sender / readable stamp; never throws.
- **Kinds** — `custom` in `ChatMessageKind`, `ChatMessage.custom` payload.
- **Tests** — asset naming, resync identity, dev validation, at-latest
  gate, guest composer, quote-in-draft, provider guard, the KNF socket
  client's lifecycle, the change feed; `TZ=UTC` pinned.

## 1.0.0 — 2026-08-30

First cut, extracted from the KNF app's `hooks/chat/*`, `services/socket.ts`
and the chat half of `services/api/*`:

- `ChatTransport` — the backend seam, expressed in the engine's own domain
  types, with a single `ChatEvent` union for realtime.
- `ChatEngineProvider` — transport, current user, storage, notices (codes),
  network-restore signal, optional video poster extractor, limits.
- Hooks: `useConversation`, `useComposer`, `useReactions`, `useTyping`,
  `useChatRoom`.
- Pure reducers for every list transition (`core/reducers.ts`) and the
  outbox / draft persistence (`core/outbox.ts`).
- `adapters/knf` — the Flask + Socket.IO adapter, with the socket client's
  lifecycle (token handshake, app-state following, registry-backed
  subscriptions) intact.
- `testing/fakeTransport` and `testing/describeTransportContract` — the
  reference backend and the conformance suite any adapter can run.
- `example/ExampleRoom.tsx` (bare-RN room over the fake), `example/ExampleAdapter.ts`
  (generic REST + WebSocket adapter) with its conformance test.
- Specs live inside the package (`src/**/__tests__/`) with their own
  `npm test` (jest-expo + the package's babel config); `__tests__` is
  excluded from `files`.
