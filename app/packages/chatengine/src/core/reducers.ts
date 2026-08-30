// -----------------------------------------------------------
//  [*] chatengine — reducers
//
//  The pure state logic behind the hooks: every transition a
//  conversation's newest-first list goes through, as functions
//  of (list, input) → list with no React, no transport and no
//  clock beyond the stamps on the rows. The hooks only wire
//  these to setState; the tests pin them directly.
//
//  Split into:
//
//    normalizeForViewer  — isOwn / bySelf against the viewer
//    findTempFor / adoptTemp — own-echo dedupe
//    mergeFirstPage      — first load over live rows + outbox
//    mergeResyncPage     — the newest page after a drop
//    appendOlderPage     — before-cursor paging
//    markDeleted / markEdited — unsend / edit, quotes included
//    withSelfReaction    — one user's membership rewrite
//    applyReceipt        — a reader's receipt on own rows
//    restoreDeleted      — the unsend revert
// -----------------------------------------------------------

import { stampMs } from './time';
import { isTempId, type ChatMessage, type ChatReaction, type ChatReplyRef, type ReactionGroup } from './types';







// -----------------------------------------------------------
// normalizeForViewer
// -----------------------------------------------------------
//
// Adapters do not know who is looking: isOwn and every
// reaction's bySelf are derived here from the viewer's id, on
// every ingest (pages, echoes, reaction events). A row without
// a status gets the sensible one — own rows start 'sent',
// everyone else's are simply 'read'.
//
// Used by:
//   - hooks/useConversation.ts, hooks/useComposer.ts
// -----------------------------------------------------------

export function reactionsForViewer(groups: readonly ReactionGroup[] | readonly ChatReaction[], viewerId: string | null): ChatReaction[] {
  return groups.map((r) => ({
    emoji: r.emoji,
    count: r.byUserIds.length || r.count,
    bySelf: !!viewerId && r.byUserIds.includes(viewerId),
    byUserIds: r.byUserIds,
  }));
}

export function normalizeForViewer(message: ChatMessage, viewerId: string | null): ChatMessage {
  const isOwn = !!viewerId && message.senderId === viewerId;
  return {
    ...message,
    isOwn,
    status: message.status ?? (isOwn ? 'sent' : 'read'),
    reactions: reactionsForViewer(message.reactions ?? [], viewerId),
  };
}







// -----------------------------------------------------------
// findTempFor / adoptTemp
// -----------------------------------------------------------
//
// The server row of an own send, whether it arrives as a socket
// echo or inside a resync page, must REPLACE the optimistic temp
// that produced it — never sit beside it. Rows that echo the
// send's clientId name their temp exactly (and match nothing
// when it is gone); rows without the nonce fall back to content
// — the same text, image path AND reply target, preferring the
// temp nearest the newest end so an older failed duplicate can
// never swallow a fresh send's echo. The adopted row keeps the
// temp's key and local media so the bubble does not remount.
//
// Used by:
//   - hooks/useConversation.ts — echo handler, resync merge
// -----------------------------------------------------------

export function findTempFor(list: readonly ChatMessage[], incoming: ChatMessage): number {
  if (incoming.clientId) {
    return list.findIndex((m) => isTempId(m.id) && (m.clientId ?? m.id) === incoming.clientId);
  }
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (
      isTempId(m.id) &&
      m.text === incoming.text &&
      (m.imageUrl ?? '') === (incoming.imageUrl ?? '') &&
      (m.replyTo?.id ?? '') === (incoming.replyTo?.id ?? '')
    ) {
      return i;
    }
  }
  return -1;
}

export function adoptTemp(incoming: ChatMessage, temp: ChatMessage): ChatMessage {
  return {
    ...incoming,
    clientId: temp.clientId ?? temp.id,
    localImageUri: temp.localImageUri,
    video: incoming.video && temp.video ? { ...incoming.video, localThumbnailUri: temp.video.localThumbnailUri } : incoming.video,
  };
}







// -----------------------------------------------------------
// mergeFirstPage
// -----------------------------------------------------------
//
// The first page lands OVER whatever is already there: live
// rows that arrived during the fetch and pending temps stay on
// top; a temp whose send actually committed (its clientId
// echoes in the page) is dropped, not shown beside its row;
// outbox temps come back on top unless the page or the live
// rows already cover them. `page` is newest-first.
//
// Used by:
//   - hooks/useConversation.ts — first load
// -----------------------------------------------------------

export function mergeFirstPage(
  prev: readonly ChatMessage[],
  page: readonly ChatMessage[],
  outbox: readonly ChatMessage[],
  conversationId: string,
): ChatMessage[] {
  const known = new Set(page.map((m) => m.id));
  const committed = new Set(page.map((m) => m.clientId).filter(Boolean));
  const kept = prev.filter(
    (m) => m.conversationId === conversationId && !known.has(m.id) && !(isTempId(m.id) && committed.has(m.clientId ?? m.id)),
  );
  const keptIds = new Set(kept.map((m) => m.id));
  const restored = outbox.filter((m) => !known.has(m.id) && !keptIds.has(m.id) && !committed.has(m.id));
  return [...restored, ...kept, ...page];
}







// -----------------------------------------------------------
// mergeResyncPage
// -----------------------------------------------------------
//
// The newest page after a socket drop or a network restore,
// MERGED by id — unknown rows slot in by stamp, known rows take
// the server's version, temps and paged history stay put — so a
// gap of missed messages closes without the list jumping. A gap
// wider than one page (the page shares nothing with the loaded
// history and the server says there is more) cannot be
// stitched: the list restarts from this head, keeping temps and
// any live row newer than the fetched head. `page` is
// newest-first. Returns the list and whether it was a fresh
// head (the caller resets hasMore then).
//
// Used by:
//   - hooks/useConversation.ts — resync
// -----------------------------------------------------------

export function mergeResyncPage(
  prev: readonly ChatMessage[],
  page: readonly ChatMessage[],
  pageHasMore: boolean,
): { list: ChatMessage[]; freshHead: boolean } {
  const loadedServerRows = prev.filter((m) => !isTempId(m.id));
  const loadedIds = new Set(loadedServerRows.map((m) => m.id));
  const freshHead = loadedServerRows.length === 0 || (pageHasMore && !page.some((row) => loadedIds.has(row.id)));

  if (freshHead) {
    const newestStamp = page.length > 0 ? stampMs(page[0].createdAt) : 0;
    const pageIds = new Set(page.map((row) => row.id));
    let kept = prev.filter((m) => isTempId(m.id) || (!pageIds.has(m.id) && stampMs(m.createdAt) > newestStamp));
    const head = page.map((row) => {
      if (!row.isOwn) return row;
      const i = findTempFor(kept, row);
      if (i < 0) return row;
      const adopted = adoptTemp(row, kept[i]);
      kept = kept.filter((_, index) => index !== i);
      return adopted;
    });
    return { list: [...kept, ...head], freshHead: true };
  }

  // Copy-on-first-write merge: the array is copied at most once,
  // and the re-sort runs only when an unknown row was inserted
  let next: ChatMessage[] | null = null;
  let inserted = false;
  for (const row of page) {
    const base = next ?? prev;
    const index = base.findIndex((m) => m.id === row.id);
    if (index >= 0) {
      const known = base[index];
      if (!next) next = prev.slice();
      next[index] = { ...row, clientId: known.clientId, localImageUri: known.localImageUri };
      continue;
    }
    const tempIndex = row.isOwn ? findTempFor(base, row) : -1;
    if (!next) next = prev.slice();
    if (tempIndex >= 0) {
      next[tempIndex] = adoptTemp(row, next[tempIndex]);
    } else {
      next.push(row);
      inserted = true;
    }
  }
  if (!next) return { list: prev as ChatMessage[], freshHead: false };
  if (!inserted) return { list: next, freshHead: false };

  // Decorate–sort–undecorate: each stamp parses once, temps pin
  // to the newest end, ties keep their order
  const decorated: [number, ChatMessage][] = next.map((m) => [isTempId(m.id) ? Number.POSITIVE_INFINITY : stampMs(m.createdAt), m]);
  decorated.sort((a, b) => (a[0] === b[0] ? 0 : b[0] - a[0]));
  return { list: decorated.map((entry) => entry[1]), freshHead: false };
}







// -----------------------------------------------------------
// appendOlderPage / olderCursor
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useConversation.ts — loadOlder
// -----------------------------------------------------------

export function appendOlderPage(prev: readonly ChatMessage[], page: readonly ChatMessage[]): ChatMessage[] {
  const known = new Set(prev.map((m) => m.id));
  return [...prev, ...page.filter((m) => !known.has(m.id))];
}

// The oldest REAL row — temps only live at the newest end, but
// skip them defensively
export function olderCursor(list: readonly ChatMessage[]): ChatMessage | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (!isTempId(list[i].id)) return list[i];
  }
  return undefined;
}







// -----------------------------------------------------------
// markDeleted / markEdited / restoreDeleted
// -----------------------------------------------------------
//
// An unsend blanks the row and flips every quote of it; an edit
// rewrites the text and stamps the row, and follows into quotes.
// restoreDeleted is the optimistic unsend's revert: only what
// the optimistic pass touched comes back — receipts and
// reactions that landed meanwhile stay.
//
// Used by:
//   - hooks/useConversation.ts, hooks/useComposer.ts
// -----------------------------------------------------------

export function markDeleted(m: ChatMessage, messageId: string): ChatMessage {
  let next = m;
  if (m.id === messageId && !m.deleted) {
    next = { ...m, text: '', imageUrl: undefined, file: undefined, video: undefined, mediaSize: undefined, reactions: [], deleted: true };
  }
  if (next.replyTo && next.replyTo.id === messageId && !next.replyTo.deleted) {
    next = { ...next, replyTo: { ...next.replyTo, text: '', imageUrl: undefined, fileName: undefined, deleted: true } };
  }
  return next;
}

export function markEdited(m: ChatMessage, messageId: string, text: string, editedAt: string): ChatMessage {
  let next = m;
  if (m.id === messageId && !m.deleted) {
    next = { ...m, text, editedAt };
  }
  if (next.replyTo && next.replyTo.id === messageId && !next.replyTo.deleted) {
    next = { ...next, replyTo: { ...next.replyTo, text } };
  }
  return next;
}

export function restoreDeleted(list: readonly ChatMessage[], snapshot: readonly ChatMessage[], messageId: string): ChatMessage[] {
  const original = snapshot.find((m) => m.id === messageId);
  const quotes = new Map(
    snapshot.filter((m) => m.replyTo?.id === messageId).map((m): [string, ChatReplyRef | undefined] => [m.id, m.replyTo]),
  );
  return list.map((m) => {
    if (m.id === messageId && original) {
      return {
        ...m,
        text: original.text,
        imageUrl: original.imageUrl,
        file: original.file,
        video: original.video,
        mediaSize: original.mediaSize,
        reactions: original.reactions,
        deleted: original.deleted,
      };
    }
    if (m.replyTo && m.replyTo.id === messageId) {
      const quote = quotes.get(m.id);
      if (quote) return { ...m, replyTo: { ...m.replyTo, text: quote.text, imageUrl: quote.imageUrl, fileName: quote.fileName, deleted: quote.deleted } };
    }
    return m;
  });
}







// -----------------------------------------------------------
// withSelfReaction
// -----------------------------------------------------------
//
// Rewrites ONE user's membership across an emoji-group array:
// strips them from every group, re-adds them to `emoji` (null =
// none) and recomputes count/bySelf. Serves both the optimistic
// pass (the new pick) and the failure revert — the inverse of an
// optimistic apply is this same rewrite with the previous emoji.
//
// Used by:
//   - hooks/useReactions.ts
// -----------------------------------------------------------

export function withSelfReaction(reactions: readonly ChatReaction[], userId: string, emoji: string | null): ChatReaction[] {
  const stripped = reactions
    .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((uid) => uid !== userId) }))
    .filter((r) => r.byUserIds.length > 0);
  if (emoji) {
    const idx = stripped.findIndex((r) => r.emoji === emoji);
    if (idx >= 0) stripped[idx] = { ...stripped[idx], byUserIds: [...stripped[idx].byUserIds, userId] };
    else stripped.push({ emoji, byUserIds: [userId], count: 1, bySelf: true });
  }
  return stripped.map((r) => ({ ...r, count: r.byUserIds.length, bySelf: r.byUserIds.includes(userId) }));
}







// -----------------------------------------------------------
// applyReceipt
// -----------------------------------------------------------
//
// A receipt names ONE reader — accumulate readers per own
// message and only claim 'read' once every OTHER member has read
// it; the first reader promotes 'sent' → 'delivered'. Unchanged
// rows keep their identity (a window of memoised bubbles must
// not repaint).
//
// Used by:
//   - hooks/useConversation.ts — the 'read' event
// -----------------------------------------------------------

export function applyReceipt(
  list: readonly ChatMessage[],
  readerId: string,
  messageIds: readonly string[],
  memberCount: number,
): ChatMessage[] {
  const readSet = new Set(messageIds);
  let changed = false;
  const next = list.map((m) => {
    if (!m.isOwn || !readSet.has(m.id)) return m;
    if (m.status !== 'sent' && m.status !== 'delivered') return m;
    const readBy = m.readBy?.includes(readerId) ? m.readBy : [...(m.readBy ?? []), readerId];
    const others = readBy.filter((id) => id !== m.senderId).length;
    const status: ChatMessage['status'] = memberCount > 1 && others >= memberCount - 1 ? 'read' : 'delivered';
    if (status === m.status && readBy === m.readBy) return m;
    changed = true;
    return { ...m, status, readBy };
  });
  return changed ? next : (list as ChatMessage[]);
}
