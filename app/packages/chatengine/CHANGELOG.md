# Changelog

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
