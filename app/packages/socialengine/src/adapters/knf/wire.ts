// -----------------------------------------------------------
//  [*] socialengine — KNF adapter: wire
//
//  The KNF backend's payload shapes and their mapping into the
//  engine's vocabulary, kept apart from the request plumbing
//  so the shapes are testable on their own. The backend
//  addresses a poll BY ITS POST — the engine's pollId is the
//  post id throughout this adapter — and its polls are
//  single-answer with an end date (no separate closed flag:
//  expiry is the only closing mechanism).
//
//  The HttpClient here is the adapter's only dependency: the
//  host brings whatever client it already has (the same
//  pattern the chat adapter uses), and the error objects that
//  client rejects with only need a numeric `status` for the
//  engine's judgements to read.
//
//  Used by:
//    - adapters/knf/index.ts — createKnfSocialTransport
//    - adapters/knf/__tests__ — shape fixtures
// -----------------------------------------------------------

import type { Poll } from '../../core/types';


export interface HttpRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface HttpClient {
  get<T>(path: string, options?: HttpRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
  delete<T>(path: string, options?: HttpRequestOptions): Promise<T>;
}

// GET /news/<postId>/poll and the body a successful vote answers
export interface ApiPoll {
  id: string;
  postId: string;
  title: string;
  // ISO stamp or null — the poll's only closing mechanism
  endDate: string | null;
  totalVotes: number;
  createdAt: string;
  // The caller's chosen option id, null when not voted
  userVote: string | null;
  options: { id: string; text: string; votes: number }[];
}

// POST /news/<postId>/like
export interface ApiLikeResponse {
  liked: boolean;
  likes: number;
}

// POST /social/friends/request — 'accepted' is the auto-accept
// (the other side had already asked)
export interface ApiFriendRequestResponse {
  id?: string;
  status: 'pending' | 'accepted';
}

// One row of GET /social/friends/requests
export interface ApiFriendRequestRow {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
}







// -----------------------------------------------------------
// toPoll
// -----------------------------------------------------------
//
// Single-answer semantics: votedByMe rides on userVote, and
// voterCount stays unset — with one vote per person the total
// IS the voter count, and pollPercent's `voterCount ??
// totalVotes` denominator lands on the right number anyway.
// `closed` is always false from the wire; expiry (expiresAt)
// is the only gate, judged client-side by isPollExpired.
//
// Used by:
//   - adapters/knf/index.ts — fetchPoll and vote
// -----------------------------------------------------------

export function toPoll(api: ApiPoll): Poll {
  return {
    // The engine addresses the poll the way the backend does:
    // by the post that carries it
    id: api.postId,
    question: api.title,
    options: api.options.map((option) => ({
      id: option.id,
      text: option.text,
      voteCount: option.votes,
      votedByMe: api.userVote !== null && option.id === api.userVote,
    })),
    answerType: 'single',
    totalVotes: api.totalVotes,
    expiresAt: api.endDate,
    closed: false,
    votedByMe: api.userVote !== null,
  };
}
