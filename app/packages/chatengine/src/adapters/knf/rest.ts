// -----------------------------------------------------------
//  [*] chatengine — knf adapter: REST
//
//  The KNF Flask API behind ChatTransport's request half,
//  through an injected HttpClient — the host brings its own
//  axios / fetch wrapper with the auth header, base URL and
//  interceptors it already has. Errors are normalised to
//  TransportError by duck-typing the client's own error
//  (status / code / serverCode), so the engine's retry policy
//  reads any client.
//
//  Split into:
//
//    HttpClient      — what the host injects
//    createKnfRest   — the request half of the transport
// -----------------------------------------------------------

import { toTransportError, TransportError } from '../../core/errors';
import type { ChatTransport, OutgoingMessage, UploadAsset, UploadResult } from '../../core/transport';
import type { ChatMessage, ReactionGroup } from '../../core/types';
import { toChatMessage, toMessagesPage, toReactionGroups, type ApiChangesResponse, type ApiMessage, type ApiMessagesResponse, type ApiReactionGroup, type ApiUploadResponse } from './wire';


export interface HttpRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  // The body is a FormData — the client must send it multipart
  multipart?: boolean;
  // Hears the request body's upload fraction (0..1) when the
  // client can observe it (axios can)
  onUploadProgress?: (fraction: number) => void;
}

export interface HttpClient {
  get<T>(path: string, options?: HttpRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
  delete<T>(path: string, options?: HttpRequestOptions): Promise<T>;
}

export interface KnfRestOptions {
  http: HttpClient;
  // Builds the multipart part for a local file. React Native
  // takes { uri, name, type }; web needs a Blob — the host knows
  // which it is. Default: the RN object shape
  filePart?: (asset: UploadAsset, name: string, type: string) => Promise<Blob | { uri: string; name: string; type: string }>;
  uploadTimeoutMs?: { image: number; file: number; video: number; audio: number };
}


const enc = encodeURIComponent;

const guard = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (err) {
    throw toTransportError(err);
  }
};

const defaultTimeouts = { image: 30_000, file: 45_000, video: 120_000, audio: 45_000 };







// -----------------------------------------------------------
// createKnfRest
// -----------------------------------------------------------
//
// Used by:
//   - adapters/knf/index.ts — createKnfTransport
// -----------------------------------------------------------

export function createKnfRest(options: KnfRestOptions): Omit<ChatTransport, 'realtime'> {
  const { http } = options;
  const filePart = options.filePart ?? (async (asset, name, type) => ({ uri: asset.uri, name, type }));
  const timeouts = { ...defaultTimeouts, ...(options.uploadTimeoutMs ?? {}) };

  return {
    fetchMessages: (conversationId, opts) =>
      guard(async () => {
        const before = opts?.before;
        const after = opts?.after;
        const resp = await http.get<ApiMessagesResponse>(`/chat/conversations/${enc(conversationId)}/messages`, {
          params: {
            limit: opts?.limit ?? 50,
            ...(before ? { before: before.createdAt, before_id: before.id } : {}),
            ...(after ? { after: after.createdAt, after_id: after.id } : {}),
            ...(opts?.around ? { around: opts.around } : {}),
          },
        });
        return toMessagesPage(resp);
      }),

    sendMessage: (conversationId, message: OutgoingMessage) =>
      guard(async () => {
        const body = {
          ...(message.text ? { text: message.text } : {}),
          ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
          ...(message.replyToId ? { replyToId: message.replyToId } : {}),
          client_msg_id: message.clientId,
          ...(message.forwarded ? { forwarded: true } : {}),
          ...(message.attachment ? { attachment: message.attachment } : {}),
          ...(message.media ? { media: message.media } : {}),
          ...(message.gallery ? { gallery: message.gallery } : {}),
          ...(message.kind ? { kind: message.kind } : {}),
        };
        const resp = await http.post<{ message: ApiMessage }>(`/chat/conversations/${enc(conversationId)}/messages`, body);
        const row = toChatMessage(resp.message);
        return { ...row, isOwn: true, status: row.status ?? 'sent' } as ChatMessage;
      }),

    editMessage: (conversationId, messageId, text) =>
      guard(() => http.put<{ id: string; text: string; editedAt: string }>(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}`, { text })),

    deleteMessage: (conversationId, messageId) =>
      guard(async () => {
        await http.delete(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}`);
      }),

    setReaction: (conversationId, messageId, emoji): Promise<ReactionGroup[]> =>
      guard(async () => {
        const resp = await http.post<{ reactions: ApiReactionGroup[] }>(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}/react`, { emoji });
        return toReactionGroups(resp.reactions);
      }),

    removeReaction: (conversationId, messageId): Promise<ReactionGroup[]> =>
      guard(async () => {
        const resp = await http.delete<{ reactions: ApiReactionGroup[] }>(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}/react`);
        return toReactionGroups(resp.reactions);
      }),

    markRead: (conversationId) =>
      guard(async () => {
        await http.put(`/chat/conversations/${enc(conversationId)}/read`);
      }),

    fetchChanges: (conversationId, since) =>
      guard(async () => {
        const resp = await http.get<ApiChangesResponse>(`/chat/conversations/${enc(conversationId)}/changes`, { params: { since } });
        return { messages: resp.messages.map(toChatMessage), cursor: resp.cursor };
      }),

    pinMessage: (conversationId, messageId) =>
      guard(async () => {
        await http.put(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}/pin`);
      }),

    unpinMessage: (conversationId, messageId) =>
      guard(async () => {
        await http.delete(`/chat/conversations/${enc(conversationId)}/messages/${enc(messageId)}/pin`);
      }),

    fetchPins: (conversationId) =>
      guard(async () => {
        const resp = await http.get<{ pins: ApiMessage[] }>(`/chat/conversations/${enc(conversationId)}/pins`);
        return (resp.pins ?? []).map(toChatMessage);
      }),

    setMessageTtl: (conversationId, seconds) =>
      guard(async () => {
        await http.put(`/chat/conversations/${enc(conversationId)}/ttl`, { seconds });
      }),

    upload: (asset: UploadAsset, onProgress?: (fraction: number) => void): Promise<UploadResult> =>
      guard(async () => {
        const name = asset.name || asset.uri.split('/').pop() || (asset.kind === 'video' ? 'video.mp4' : asset.kind === 'file' ? 'file' : 'photo.jpg');
        const type =
          asset.mimeType ||
          (asset.kind === 'video' ? 'video/mp4' : asset.kind === 'file' ? 'application/octet-stream' : name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
        const form = new FormData();
        if (asset.kind !== 'image') form.append('kind', asset.kind);
        const part = await filePart(asset, name, type);
        if (part instanceof Blob) form.append('file', part, name);
        else form.append('file', part as unknown as Blob);
        try {
          const resp = await http.post<ApiUploadResponse>('/uploads', form, { multipart: true, timeoutMs: timeouts[asset.kind], onUploadProgress: onProgress });
          return {
            url: resp.url,
            name: resp.name ?? name,
            size: resp.size ?? asset.size ?? 0,
            mime: resp.mime ?? type,
            width: resp.width ?? null,
            height: resp.height ?? null,
            preview: resp.preview ?? null,
          };
        } catch (err) {
          // The backend's size rejection is tagged like a preflight one
          const e = toTransportError(err);
          if (e.kind === 'http' && !e.serverCode && /too large/i.test(e.message)) {
            throw new TransportError(e.message, 'http', e.status, 'file_too_large', e.data);
          }
          throw e;
        }
      }),
  };
}
