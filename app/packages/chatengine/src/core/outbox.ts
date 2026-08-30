// -----------------------------------------------------------
//  [*] chatengine — outbox
//
//  The persisted failed-send queue and the per-room draft, as
//  pure (de)serialisation over the host's KeyValueStorage.
//  Keys: outbox:<conversationId>, draft:<conversationId>.
//  The queue is an id → payload record; readOutboxTemps turns
//  it back into failed temp rows for the first page so a send
//  that died with the app stays visible and retryable. Tolerant
//  of both persisted shapes (record, or an entries array) and
//  answers [] to anything unreadable — a convenience, never a
//  crash.
//
//  Used by:
//    - hooks/useConversation.ts — first load
//    - hooks/useComposer.ts — persist / rehydrate
// -----------------------------------------------------------

import type { KeyValueStorage } from '../provider/storage';
import type { OutgoingMessage, UploadAsset } from './transport';
import { isTempId, type ChatMessage, type ChatUser } from './types';


export const outboxKey = (conversationId: string) => `outbox:${conversationId}`;
export const draftKey = (conversationId: string) => `draft:${conversationId}`;
// The quoted message a draft answers, kept beside it
export const draftReplyKey = (conversationId: string) => `draftreply:${conversationId}`;


// A picked asset waiting for its upload
export interface PickedAsset extends UploadAsset {
  width?: number;
  height?: number;
  duration?: number;
  // A poster frame the host already extracted (videos)
  posterUri?: string;
  // A voice note's amplitude bars (0..1, at most 64)
  waveform?: number[];
}

// What a failed send needs to retry: the body, the uploaded
// image path — or, when the upload itself failed, the picked
// asset so the retry uploads again; `extra` is the attachment /
// media of a send that failed AFTER its upload. createdAt is the
// bubble's original stamp, persisted so a rehydrated bubble
// keeps it
export interface OutboxEntry {
  text: string;
  imageUrl?: string;
  replyToId?: string;
  asset?: PickedAsset;
  // A gallery send whose uploads did not finish — the retry
  // uploads every photo again
  assets?: PickedAsset[];
  extra?: Pick<OutgoingMessage, 'kind' | 'attachment' | 'media' | 'gallery'>;
  createdAt?: string;
}


export async function readOutbox(storage: KeyValueStorage, conversationId: string): Promise<Map<string, OutboxEntry>> {
  const result = new Map<string, OutboxEntry>();
  try {
    const raw = await storage.getItem(outboxKey(conversationId));
    if (!raw) return result;
    const parsed = JSON.parse(raw) as unknown;
    const entries: [string, OutboxEntry][] = Array.isArray(parsed)
      ? (parsed as [string, OutboxEntry][]).filter((e) => Array.isArray(e) && typeof e[0] === 'string')
      : parsed && typeof parsed === 'object'
        ? Object.entries(parsed as Record<string, OutboxEntry>)
        : [];
    for (const [tempId, payload] of entries) {
      if (!isTempId(tempId) || !payload || typeof payload !== 'object') continue;
      result.set(tempId, {
        text: typeof payload.text === 'string' ? payload.text : '',
        imageUrl: typeof payload.imageUrl === 'string' && payload.imageUrl ? payload.imageUrl : undefined,
        replyToId: typeof payload.replyToId === 'string' ? payload.replyToId : undefined,
        asset: payload.asset && typeof payload.asset === 'object' && typeof payload.asset.uri === 'string' ? payload.asset : undefined,
        extra: payload.extra && typeof payload.extra === 'object' ? payload.extra : undefined,
        createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
      });
    }
  } catch {
    // Unreadable storage never blocks the composer
  }
  return result;
}


export async function writeOutbox(storage: KeyValueStorage, conversationId: string, entries: ReadonlyMap<string, OutboxEntry>): Promise<void> {
  const key = outboxKey(conversationId);
  try {
    if (entries.size === 0) {
      await storage.removeItem(key);
      return;
    }
    const record: Record<string, OutboxEntry> = {};
    for (const [tempId, payload] of entries) record[tempId] = payload;
    await storage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage is a convenience
  }
}


// The failed temp rows a persisted queue turns back into
export async function readOutboxTemps(storage: KeyValueStorage, conversationId: string, sender: ChatUser | null): Promise<ChatMessage[]> {
  if (!sender) return [];
  const entries = await readOutbox(storage, conversationId);
  return Array.from(entries.entries()).map(([tempId, payload]) => ({
    id: tempId,
    clientId: tempId,
    conversationId,
    senderId: sender.id,
    senderName: sender.displayName,
    senderAvatar: sender.avatarUrl ?? undefined,
    text: payload.text,
    imageUrl: payload.imageUrl,
    localImageUri: payload.asset?.kind === 'video' ? undefined : payload.asset?.uri,
    kind: payload.extra?.kind ?? payload.asset?.kind ?? (payload.assets ? 'image' : undefined),
    video: payload.asset?.kind === 'video' ? { uri: payload.asset.uri, duration: payload.asset.duration, localThumbnailUri: payload.asset.posterUri } : undefined,
    file: payload.asset?.kind === 'file' ? { name: payload.asset.name ?? '', uri: payload.asset.uri, size: payload.asset.size, mimeType: payload.asset.mimeType } : undefined,
    audio: payload.asset?.kind === 'audio' ? { uri: payload.asset.uri, duration: payload.asset.duration, size: payload.asset.size, mimeType: payload.asset.mimeType, name: payload.asset.name } : undefined,
    gallery: payload.extra?.gallery ?? payload.assets?.map((a) => ({ url: a.uri, width: a.width, height: a.height })),
    createdAt: payload.createdAt ?? new Date().toISOString(),
    isOwn: true,
    status: 'failed' as const,
    reactions: [],
    deleted: false,
  }));
}
