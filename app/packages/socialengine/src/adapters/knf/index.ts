// -----------------------------------------------------------
//  [*] socialengine — KNF adapter
//
//  SocialTransport over the KNF backend's REST routes, through
//  an injected HttpClient. What the mapping smooths over:
//
//    - the like endpoint is a TOGGLE (POST …/like flips), not
//      a set-this-state call. The adapter fires the toggle and
//      returns the server's authoritative answer untouched —
//      when another device raced, the answered state may
//      differ from `desired`, and the server's word is the one
//      the engine's shadow reconciles to;
//    - a poll lives under its post (pollId IS the post id) and
//      takes exactly one option; a repeat vote for the SAME
//      option answers 409, which the adapter absorbs by
//      re-fetching the poll — the caller still receives the
//      current state, exactly what it asked to reach;
//    - accept/decline/cancel address a REQUEST id the engine
//      does not hold, so the adapter resolves the other side's
//      user id through the requests listing on the way
//      (received for accept/decline, sent for cancel — the
//      reject route doubles as the withdrawal when the caller
//      is the sender, and the backend skips the cooldown for
//      that case);
//    - disconnect on a pair that is already not friends answers
//      404 — the state the caller wanted already stands, so the
//      adapter absorbs it and answers 'none';
//    - the friend-request COOLDOWN (a declined pair re-asking
//      too soon) answers 429, which the engine's judgement
//      reads as retryable-shaped; the hook still reverts and
//      notifies — no retry loop starts — so the blunt UX is a
//      toast, not a stuck spinner;
//    - comment likes do not exist on this backend: comment
//      targets refuse with a definitive 400 ('unsupported');
//    - the activity list rides /social/activity with an opaque
//      "<createdAt>|<id>" cursor the adapter echoes verbatim.
//
//  Used by:
//    - the host app's transport wiring (when the feed screens
//      move onto the engine)
//    - adapters/knf/__tests__/contract.test.ts
// -----------------------------------------------------------

import type { LikeResult, RelationshipAction, SocialTransport } from '../../core/transport';
import type { Poll, RelationshipState } from '../../core/types';
import { toPoll, toSocialNotification, type ApiActivityResponse, type ApiFriendRequestResponse, type ApiFriendRequestRow, type ApiLikeResponse, type ApiPoll, type HttpClient } from './wire';


export interface KnfSocialOptions {
  http: HttpClient;
}


const enc = encodeURIComponent;

// 400, not 501: a 5xx would read as retryable-shaped to
// isRetryableError, and there is nothing here a retry can heal
const unsupported = (what: string): Error =>
  Object.assign(new Error(`${what} is not supported by this backend`), { status: 400, code: 'unsupported' });

const statusOf = (err: unknown): number | null => {
  if (!err || typeof err !== 'object') return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
};







// -----------------------------------------------------------
// createKnfSocialTransport
// -----------------------------------------------------------
//
// Used by:
//   - the host app (services layer) — one instance per session
// -----------------------------------------------------------

export function createKnfSocialTransport(options: KnfSocialOptions): SocialTransport {

  const { http } = options;


  // The requests listing, asked fresh per resolution:
  // accept/decline/cancel are rare taps and a stale id would 404
  // anyway. In BOTH directions the listing's userId is the OTHER
  // party, so one finder serves all three verbs
  const findRequest = async (userId: string, direction: 'received' | 'sent'): Promise<ApiFriendRequestRow | undefined> => {
    const resp = await http.get<{ requests: ApiFriendRequestRow[] }>('/social/friends/requests', {
      params: { direction },
    });
    return resp.requests.find((row) => row.userId === userId);
  };


  // Shared by fetchPoll and the vote 409 recovery — the route
  // answers the same 404 for "no poll", "no such post" and "not
  // yours to see": all of them are `null` to the engine (render
  // nothing), never an error state
  const fetchPoll = async (pollId: string): Promise<Poll | null> => {
    try {
      return toPoll(await http.get<ApiPoll>(`/news/${enc(pollId)}/poll`));
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw err;
    }
  };


  return {
    async setLiked(target, _desired): Promise<LikeResult> {
      if (target.type !== 'post') throw unsupported('liking a comment');
      const resp = await http.post<ApiLikeResponse>(`/news/${enc(target.id)}/like`);
      return { liked: resp.liked, likeCount: resp.likes };
    },

    fetchPoll,

    async vote(pollId, optionIds): Promise<Poll> {
      if (optionIds.length !== 1) {
        throw Object.assign(new Error('this backend takes exactly one option'), { status: 400 });
      }
      try {
        return toPoll(await http.post<ApiPoll>(`/news/${enc(pollId)}/poll/vote`, { option_id: optionIds[0] }));
      } catch (err) {
        // 409 = already voted for exactly this option — the state
        // the caller wanted already stands; answer it
        if (statusOf(err) === 409) {
          const current = await fetchPoll(pollId);
          if (current) return current;
        }
        throw err;
      }
    },

    async setRelationship(userId, action: RelationshipAction): Promise<RelationshipState> {
      switch (action) {
        case 'connect': {
          const resp = await http.post<ApiFriendRequestResponse>('/social/friends/request', { user_id: userId });
          // Auto-accept: the other side had already asked
          return resp.status === 'accepted' ? 'connected' : 'outgoing';
        }
        case 'accept':
        case 'decline': {
          const request = await findRequest(userId, 'received');
          if (!request) {
            throw Object.assign(new Error('no pending request from this user'), { status: 404 });
          }
          const verb = action === 'accept' ? 'accept' : 'reject';
          await http.post<{ status: string }>(`/social/friends/requests/${enc(request.id)}/${verb}`);
          return action === 'accept' ? 'connected' : 'none';
        }
        case 'cancel': {
          // The reject route doubles as the withdrawal when the
          // caller is the SENDER (the backend deletes the row and
          // skips the decline cooldown for that case)
          const request = await findRequest(userId, 'sent');
          if (!request) {
            throw Object.assign(new Error('no pending request to this user'), { status: 404 });
          }
          await http.post<{ status: string }>(`/social/friends/requests/${enc(request.id)}/reject`);
          return 'none';
        }
        case 'disconnect':
          try {
            await http.delete<{ status: string }>(`/social/friends/${enc(userId)}`);
          } catch (err) {
            // Already not friends — the state the caller wanted
            // stands; answer it instead of failing the intent
            if (statusOf(err) !== 404) throw err;
          }
          return 'none';
      }
    },

    async setBlocked(userId, blocked): Promise<void> {
      if (blocked) await http.post<{ status: string }>('/social/blocks', { user_id: userId });
      else await http.delete<{ status: string }>(`/social/blocks/${enc(userId)}`);
    },

    async report(target, reason): Promise<void> {
      // The backend moderates users, posts and (chat) messages;
      // comment reports have no lane yet
      if (target.type === 'comment') throw unsupported('reporting a comment');
      await http.post<{ status: string }>('/social/reports', {
        target_type: target.type,
        target_id: target.id,
        reason,
      });
    },

    async fetchNotifications(cursor) {
      const resp = await http.get<ApiActivityResponse>('/social/activity', {
        params: cursor ? { cursor } : {},
      });
      return {
        notifications: resp.notifications.map(toSocialNotification),
        hasMore: resp.hasMore,
        cursor: resp.cursor,
      };
    },

    async markNotificationsRead(): Promise<void> {
      await http.post<{ status: string }>('/social/activity/read');
    },

    async fetchUnreadCount(): Promise<number> {
      const resp = await http.get<{ count: number }>('/social/activity/unread');
      return resp.count;
    },
  };
}
