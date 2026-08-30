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
//    - accept/decline address a REQUEST id the engine does not
//      hold, so the adapter resolves the sender's user id
//      through the received-requests listing on the way;
//    - withdrawing an outgoing request has no endpoint — the
//      adapter refuses 'cancel' definitively (status 501), the
//      hook reverts, and the conformance harness declares
//      supportsCancel false;
//    - comment likes and an activity feed do not exist on this
//      backend: comment targets refuse with 501 and the three
//      notification methods are simply not implemented.
//
//  Used by:
//    - the host app's transport wiring (when the feed screens
//      move onto the engine)
//    - adapters/knf/__tests__/contract.test.ts
// -----------------------------------------------------------

import type { LikeResult, RelationshipAction, SocialTransport } from '../../core/transport';
import type { Poll, RelationshipState } from '../../core/types';
import { toPoll, type ApiFriendRequestResponse, type ApiFriendRequestRow, type ApiLikeResponse, type ApiPoll, type HttpClient } from './wire';


export interface KnfSocialOptions {
  http: HttpClient;
}


const enc = encodeURIComponent;

const unsupported = (what: string): Error =>
  Object.assign(new Error(`${what} is not supported by this backend`), { status: 501, code: 'unsupported' });

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


  // The received-requests listing, asked fresh per resolution:
  // accept/decline are rare taps and a stale id would 404 anyway
  const findRequestFrom = async (userId: string): Promise<ApiFriendRequestRow | undefined> => {
    const resp = await http.get<{ requests: ApiFriendRequestRow[] }>('/social/friends/requests', {
      params: { direction: 'received' },
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
          const request = await findRequestFrom(userId);
          if (!request) {
            throw Object.assign(new Error('no pending request from this user'), { status: 404 });
          }
          const verb = action === 'accept' ? 'accept' : 'reject';
          await http.post<{ status: string }>(`/social/friends/requests/${enc(request.id)}/${verb}`);
          return action === 'accept' ? 'connected' : 'none';
        }
        case 'disconnect':
          await http.delete<{ status: string }>(`/social/friends/${enc(userId)}`);
          return 'none';
        case 'cancel':
          // No withdrawal endpoint exists; a definitive refusal
          // makes the hook revert to 'outgoing' — honest, if blunt
          throw unsupported('withdrawing a sent request');
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

    // No activity-list endpoints exist on this backend yet — the
    // three notification methods stay unimplemented on purpose,
    // and useNotifications reports `supported: false`
  };
}
