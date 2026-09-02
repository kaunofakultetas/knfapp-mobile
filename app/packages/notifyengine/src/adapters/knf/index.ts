// -----------------------------------------------------------
//  [*] notifyengine — the KNF transport adapter
//
//  The faculty backend's notification endpoints behind the
//  NotifyTransport seam, over an injected HTTP client (the
//  same pattern as the chat adapter — the package never owns
//  a fetch stack or a base URL). Three disciplines, all
//  pinned by the conformance suite:
//
//    - every response is FIELD-VALIDATED before trust — a
//      garbage body becomes a typed 'server' failure, never a
//      crash or a silently-poisoned cache;
//    - unregister treats 404 as success — an already-forgotten
//      token is exactly the state we wanted;
//    - errors surface as TransportFailure codes ('network' |
//      'auth' | 'server'), so the engine's typed reasons stay
//      honest without parsing exception strings.
//
//  Used by:
//    - hosts: createKnfNotifyTransport({http}) into the engine
// -----------------------------------------------------------

import { TransportFailure, type ChannelKey, type Language, type NotifyTransport } from '../../core/types';


// The minimal HTTP surface the adapter needs — the host wraps
// its own client (auth header injection stays host-side)
export interface NotifyHttpClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  delete(path: string, options?: { body?: unknown; authToken?: string }): Promise<unknown>;
}

const CHANNEL_KEYS: readonly ChannelKey[] = ['news', 'chat', 'schedule', 'admin'];


// The host client's errors carry {status?, code?} when they
// came off the wire; anything else is a server-side mystery
function toFailure(error: unknown): TransportFailure {
  const shaped = error as { status?: unknown; code?: unknown };
  if (shaped && (shaped.code === 'network' || shaped.code === 'timeout')) {
    return new TransportFailure('network');
  }
  if (shaped && (shaped.status === 401 || shaped.status === 403)) {
    return new TransportFailure('auth');
  }
  return new TransportFailure('server');
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}


export function createKnfNotifyTransport(deps: { http: NotifyHttpClient }): NotifyTransport {
  const { http } = deps;

  const validChannels = (body: unknown): Record<ChannelKey, boolean> => {
    // An explicit channels envelope is trusted AS the source —
    // {channels: null} is a garbage body, not "use defaults"
    const hasEnvelope = !!body && typeof body === 'object' && 'channels' in (body as Record<string, unknown>);
    const source = hasEnvelope ? (body as { channels?: unknown }).channels : body;
    if (!source || typeof source !== 'object') throw new TransportFailure('server');
    const record = source as Record<string, unknown>;
    // EVERY key must be a boolean — fabricating all-enabled
    // defaults from a garbage body would silently un-mute a
    // user's opt-outs
    const result = { news: true, chat: true, schedule: true, admin: true };
    for (const key of CHANNEL_KEYS) {
      if (typeof record[key] !== 'boolean') throw new TransportFailure('server');
      result[key] = record[key];
    }
    return result;
  };

  return {
    register: async (p: { token: string; platform: 'ios' | 'android' | 'web' | 'unknown'; language: Language }) => {
      let body: unknown;
      try {
        body = await http.post('/notifications/register', {
          token: p.token,
          platform: p.platform,
          language: p.language,
        });
      } catch (error) {
        throw toFailure(error);
      }
      // The backend mints tokenId as an opaque UUID STRING and
      // signals creation via {registered:true} without a
      // created field — best-effort mapping, never a rejection
      // of a healthy row
      const tokenId = (body as { tokenId?: unknown })?.tokenId;
      const created = (body as { created?: unknown })?.created;
      if (typeof tokenId !== 'string' || !tokenId) throw new TransportFailure('server');
      return { tokenId, created: created === true };
    },

    unregister: async (p: { token: string; authToken?: string }) => {
      try {
        await http.delete('/notifications/register', { body: { token: p.token }, authToken: p.authToken });
      } catch (error) {
        // A token the server already forgot is a success
        if (statusOf(error) === 404) return;
        throw toFailure(error);
      }
    },

    getChannels: async () => {
      try {
        return validChannels(await http.get('/notifications/channels'));
      } catch (error) {
        throw error instanceof TransportFailure ? error : toFailure(error);
      }
    },

    putChannels: async (patch) => {
      for (const key of Object.keys(patch)) {
        if (!CHANNEL_KEYS.includes(key as ChannelKey)) {
          throw new TransportFailure('server', `Unknown channel "${key}"`);
        }
      }
      try {
        return validChannels(await http.put('/notifications/channels', { channels: patch }));
      } catch (error) {
        throw error instanceof TransportFailure ? error : toFailure(error);
      }
    },

    getChatPreview: async () => {
      let body: unknown;
      try {
        body = await http.get('/notifications/chat-preview');
      } catch (error) {
        throw toFailure(error);
      }
      const enabled = (body as { enabled?: unknown })?.enabled;
      if (typeof enabled !== 'boolean') throw new TransportFailure('server');
      return enabled;
    },

    putChatPreview: async (on: boolean) => {
      let body: unknown;
      try {
        body = await http.put('/notifications/chat-preview', { enabled: on });
      } catch (error) {
        throw toFailure(error);
      }
      const enabled = (body as { enabled?: unknown })?.enabled;
      return typeof enabled === 'boolean' ? enabled : on;
    },
  };
}
