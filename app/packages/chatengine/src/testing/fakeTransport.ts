// -----------------------------------------------------------
//  [*] chatengine — testing: fakeTransport
//
//  An in-memory ChatTransport for tests and demos: history
//  pages served from a seeded list, sends that commit rows and
//  echo them like a real room, reactions kept per message, and
//  a `push(event)` door to play any realtime event by hand.
//  Every call is recorded so a test can assert what reached
//  the "server", and any method can be made to fail or stall
//  through `fail` / `stall`.
//
//  Used by:
//    - the engine's own hook tests
//    - hosts' tests (render a screen against a fake room)
//    - testing/transportContract.ts — the reference implementation
// -----------------------------------------------------------

import type { ChatEvent, ChatTransport, MessagesPage, OutgoingMessage, RealtimeStatus, UploadAsset, UploadResult } from '../core/transport';
import type { ChatMessage, ConversationMeta, Participant, ReactionGroup } from '../core/types';
import { TransportError } from '../core/errors';


export interface FakeTransportOptions {
  // Seeded history, OLDEST first (as a page arrives)
  messages?: ChatMessage[];
  participants?: Participant[];
  conversation?: ConversationMeta | null;
  pageSize?: number;
  // The user the fake stamps on committed sends
  self?: { id: string; displayName: string };
  // Echo every committed send back through the realtime door
  // (a backend that broadcasts to the sender too)
  echoSends?: boolean;
  // Guests: connect() resolves false and nothing is joined
  guest?: boolean;
}

type Method = 'fetchMessages' | 'sendMessage' | 'editMessage' | 'deleteMessage' | 'setReaction' | 'removeReaction' | 'markRead' | 'upload' | 'fetchChanges' | 'pinMessage' | 'unpinMessage' | 'fetchPins' | 'setMessageTtl';

export interface FakeTransport extends ChatTransport {
  // Every request, in order
  calls: { method: Method; args: unknown[] }[];
  // Realtime signals the engine sent (join / typing / markRead)
  signals: { name: string; args: unknown[] }[];
  // The rows the "server" holds, oldest first
  rows: ChatMessage[];
  // Play a realtime event into every subscriber
  push(event: ChatEvent): void;
  // Flip the realtime status (subscribers hear it)
  setStatus(status: RealtimeStatus): void;
  // Make the next N calls of a method reject with this error
  fail(method: Method, error: unknown, times?: number): void;
  // Hold the next call of a method until the returned release runs
  stall(method: Method): () => void;
  // Reset calls / signals (rows stay)
  reset(): void;
  // Mark a row changed server-side at the fake's clock (what the
  // change feed reports since a cursor)
  touch(messageId: string): void;
}


let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export function fakeTransport(options: FakeTransportOptions = {}): FakeTransport {
  const self = options.self ?? { id: 'self', displayName: 'Me' };
  const pageSize = options.pageSize ?? 50;
  const rows: ChatMessage[] = [...(options.messages ?? [])];
  const participants = options.participants ?? [{ id: self.id, displayName: self.displayName }];
  const conversation = options.conversation ?? null;

  const calls: FakeTransport['calls'] = [];
  const signals: FakeTransport['signals'] = [];
  const listeners = new Set<(event: ChatEvent) => void>();
  const statusListeners = new Set<(status: RealtimeStatus) => void>();
  let status: RealtimeStatus = 'disconnected';
  const failures = new Map<Method, { error: unknown; times: number }>();
  const stalls = new Map<Method, Promise<void>>();
  // A monotonic server clock: every mutation stamps the row, the
  // change feed compares against it
  let tick = 0;
  const now = () => new Date(Date.UTC(2030, 0, 1) + ++tick * 1000).toISOString();
  const changedAt = new Map<string, string>();
  const touch = (id: string) => changedAt.set(id, now());

  const gate = async (method: Method, args: unknown[]) => {
    calls.push({ method, args });
    const stall = stalls.get(method);
    if (stall) {
      stalls.delete(method);
      await stall;
    }
    const failure = failures.get(method);
    if (failure) {
      failure.times -= 1;
      if (failure.times <= 0) failures.delete(method);
      throw failure.error instanceof Error ? failure.error : new TransportError(String(failure.error), 'network');
    }
  };

  const push = (event: ChatEvent) => {
    listeners.forEach((fn) => fn(event));
  };

  const transport: FakeTransport = {
    calls,
    signals,
    rows,
    push,
    setStatus: (next) => {
      status = next;
      statusListeners.forEach((fn) => fn(next));
    },
    fail: (method, error, times = 1) => {
      failures.set(method, { error, times });
    },
    stall: (method) => {
      let release: () => void = () => {};
      stalls.set(method, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    reset: () => {
      calls.length = 0;
      signals.length = 0;
    },
    touch,

    async fetchMessages(conversationId, opts): Promise<MessagesPage> {
      await gate('fetchMessages', [conversationId, opts]);
      const mine = rows.filter((m) => m.conversationId === conversationId);
      const limit = opts?.limit ?? pageSize;
      const isOlder = (m: ChatMessage, c: { createdAt: string; id: string }) => m.createdAt < c.createdAt || (m.createdAt === c.createdAt && m.id < c.id);
      const isNewer = (m: ChatMessage, c: { createdAt: string; id: string }) => m.createdAt > c.createdAt || (m.createdAt === c.createdAt && m.id > c.id);
      if (opts?.around) {
        const anchor = mine.find((m) => m.id === opts.around);
        if (!anchor) throw new TransportError('not found', 'http', 404);
        const half = Math.max(1, Math.floor(limit / 2));
        const older = mine.filter((m) => isOlder(m, anchor));
        const newer = mine.filter((m) => isNewer(m, anchor));
        const page = [...older.slice(Math.max(0, older.length - (half - 1))), anchor, ...newer.slice(0, half)];
        return { messages: page, hasMore: older.length > half - 1, hasNewer: newer.length > half, participants, conversation, cursor: now() };
      }
      if (opts?.after) {
        const after = opts.after;
        const newer = mine.filter((m) => isNewer(m, after));
        return { messages: newer.slice(0, limit), hasMore: mine.some((m) => !isNewer(m, after)), hasNewer: newer.length > limit, participants, conversation, cursor: now() };
      }
      const before = opts?.before;
      const eligible = before ? mine.filter((m) => isOlder(m, before)) : mine;
      const page = eligible.slice(Math.max(0, eligible.length - limit));
      return { messages: page, hasMore: eligible.length > limit, hasNewer: false, participants, conversation, cursor: now() };
    },

    async fetchChanges(conversationId, since) {
      await gate('fetchChanges', [conversationId, since]);
      const changed = rows.filter((m) => m.conversationId === conversationId && (changedAt.get(m.id) ?? '') > since);
      return { messages: changed, cursor: now() };
    },

    async pinMessage(conversationId, messageId) {
      await gate('pinMessage', [conversationId, messageId]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row || row.deleted) throw new TransportError('not found', 'http', 404);
      row.pinnedAt = now();
      row.pinnedBy = self.id;
      touch(messageId);
      push({ type: 'updated', conversationId, messageId, patch: { pinnedAt: row.pinnedAt, pinnedBy: row.pinnedBy } });
    },

    async unpinMessage(conversationId, messageId) {
      await gate('unpinMessage', [conversationId, messageId]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row) throw new TransportError('not found', 'http', 404);
      row.pinnedAt = null;
      row.pinnedBy = null;
      touch(messageId);
      push({ type: 'updated', conversationId, messageId, patch: { pinnedAt: null, pinnedBy: null } });
    },

    async fetchPins(conversationId) {
      await gate('fetchPins', [conversationId]);
      return rows
        .filter((m) => m.conversationId === conversationId && m.pinnedAt && !m.deleted)
        .sort((a, b) => ((a.pinnedAt as string) < (b.pinnedAt as string) ? 1 : -1));
    },

    async setMessageTtl(conversationId, seconds) {
      await gate('setMessageTtl', [conversationId, seconds]);
      push({ type: 'conversation', conversationId, patch: { messageTtlSeconds: seconds ?? null } });
    },

    async sendMessage(conversationId, message: OutgoingMessage) {
      await gate('sendMessage', [conversationId, message]);
      // Idempotent on clientId, like the real backend
      const existing = rows.find((m) => m.conversationId === conversationId && m.clientId === message.clientId);
      if (existing) return existing;
      const row: ChatMessage = {
        id: nextId('srv'),
        clientId: message.clientId,
        conversationId,
        senderId: self.id,
        senderName: self.displayName,
        text: message.text,
        imageUrl: message.imageUrl,
        createdAt: new Date().toISOString(),
        isOwn: true,
        status: 'sent',
        readBy: [self.id],
        reactions: [],
        replyTo: message.replyToId
          ? (() => {
              const quoted = rows.find((m) => m.id === message.replyToId);
              return quoted ? { id: quoted.id, senderId: quoted.senderId, senderName: quoted.senderName, text: quoted.text, imageUrl: quoted.imageUrl, deleted: !!quoted.deleted, kind: quoted.kind, fileName: quoted.file?.name } : undefined;
            })()
          : undefined,
        deleted: false,
        kind: message.kind ?? (message.attachment ? 'file' : message.imageUrl ? 'image' : 'text'),
        file: message.kind === 'file' && message.attachment ? { name: message.attachment.name, uri: message.attachment.url, size: message.attachment.size, mimeType: message.attachment.mime } : undefined,
        video: message.kind === 'video' && message.attachment ? { uri: message.attachment.url, thumbnailUri: message.media?.thumbnailUrl, duration: message.media?.duration, size: message.attachment.size, mimeType: message.attachment.mime, name: message.attachment.name } : undefined,
        audio: message.kind === 'audio' && message.attachment ? { uri: message.attachment.url, duration: message.media?.duration, size: message.attachment.size, mimeType: message.attachment.mime, name: message.attachment.name, waveform: message.media?.waveform } : undefined,
        mediaPreview: message.media?.preview,
        forwarded: !!message.forwarded,
        mediaSize: message.media?.width && message.media?.height ? { width: message.media.width, height: message.media.height } : undefined,
        gallery: message.gallery,
      };
      rows.push(row);
      if (options.echoSends) push({ type: 'message', message: row });
      return row;
    },

    async editMessage(conversationId, messageId, text) {
      await gate('editMessage', [conversationId, messageId, text]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row) throw new TransportError('Message not found', 'http', 404);
      const editedAt = new Date().toISOString();
      row.text = text;
      row.editedAt = editedAt;
      touch(messageId);
      return { id: messageId, text, editedAt };
    },

    async deleteMessage(conversationId, messageId) {
      await gate('deleteMessage', [conversationId, messageId]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row) throw new TransportError('Message not found', 'http', 404);
      row.deleted = true;
      row.text = '';
      row.imageUrl = undefined;
      row.reactions = [];
      touch(messageId);
    },

    async setReaction(conversationId, messageId, emoji): Promise<ReactionGroup[]> {
      await gate('setReaction', [conversationId, messageId, emoji]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row) throw new TransportError('Message not found', 'http', 404);
      const stripped = row.reactions.map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== self.id) })).filter((r) => r.byUserIds.length > 0);
      const idx = stripped.findIndex((r) => r.emoji === emoji);
      if (idx >= 0) stripped[idx] = { ...stripped[idx], byUserIds: [...stripped[idx].byUserIds, self.id] };
      else stripped.push({ emoji, byUserIds: [self.id], count: 1, bySelf: false });
      row.reactions = stripped.map((r) => ({ ...r, count: r.byUserIds.length }));
      return row.reactions.map(({ emoji: e, count, byUserIds }) => ({ emoji: e, count, byUserIds }));
    },

    async removeReaction(conversationId, messageId): Promise<ReactionGroup[]> {
      await gate('removeReaction', [conversationId, messageId]);
      const row = rows.find((m) => m.id === messageId && m.conversationId === conversationId);
      if (!row) throw new TransportError('Message not found', 'http', 404);
      row.reactions = row.reactions
        .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== self.id) }))
        .filter((r) => r.byUserIds.length > 0)
        .map((r) => ({ ...r, count: r.byUserIds.length }));
      return row.reactions.map(({ emoji, count, byUserIds }) => ({ emoji, count, byUserIds }));
    },

    async markRead(conversationId) {
      await gate('markRead', [conversationId]);
    },

    async upload(asset: UploadAsset, onProgress?: (fraction: number) => void): Promise<UploadResult> {
      // Half before the gate (a stalled upload shows mid-flight
      // progress), the rest on completion
      onProgress?.(0.5);
      await gate('upload', [asset]);
      onProgress?.(1);
      const ext = asset.kind === 'video' ? 'mp4' : asset.kind === 'file' ? 'pdf' : 'jpg';
      return {
        url: `/api/uploads/${nextId('up')}.${ext}`,
        name: asset.name ?? `${asset.kind}.${ext}`,
        size: asset.size ?? 1,
        mime: asset.mimeType ?? (asset.kind === 'video' ? 'video/mp4' : asset.kind === 'file' ? 'application/pdf' : 'image/jpeg'),
        width: asset.kind === 'image' ? 1200 : null,
        height: asset.kind === 'image' ? 800 : null,
        preview: asset.kind === 'image' ? 'data:image/jpeg;base64,tiny' : null,
      };
    },

    realtime: {
      connect: async () => {
        if (options.guest) return false;
        if (status !== 'connected') transport.setStatus('connected');
        return true;
      },
      status: () => status,
      onStatus: (listener) => {
        statusListeners.add(listener);
        return () => {
          statusListeners.delete(listener);
        };
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      join: (conversationId) => {
        signals.push({ name: 'join', args: [conversationId] });
      },
      typing: (conversationId, active) => {
        signals.push({ name: 'typing', args: [conversationId, active] });
      },
      markRead: (conversationId) => {
        signals.push({ name: 'markRead', args: [conversationId] });
      },
    },
  };

  return transport;
}
