// -----------------------------------------------------------
//  [*] socialengine — provider
//
//  The one context every hook reads: the transport, the
//  viewer, the notice channel and the two shadow stores. The
//  engine works signed OUT — currentUser null means every
//  write-capable hook reports canAct false and routes a tap to
//  requireAuth() instead of the transport (auth adds features,
//  never gates reading).
//
//  The shadow stores — and the poll store, whose polls carry
//  the viewer's own vote — are wiped whenever the signed-in
//  account CHANGES (including to/from guest): one account's
//  optimistic intents must never bleed into the next one's
//  rows.
//
//  The offline drain replays every parked intent through the
//  SAME per-target toggle queue the live hooks use, so a
//  target has exactly one serialising writer: a tap made
//  while a replay is on the wire queues behind it (and the
//  replay's late answer can no longer overwrite the newer
//  tap's settled state), and a parked intent whose target
//  already has a live call running is stale — the live lane
//  parks only its own final failure — and is dropped unsent
//  (KNF-121).
//
//  now() exists so poll expiry is testable — hosts never pass
//  it, tests freeze it.
//
//  Used by:
//    - every hook in the package
// -----------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { createUnreadSignal, type UnreadSignal } from '../core/notifications';
import type { PollEntry } from '../core/poll';
import { createShadowStore, type PostShadow, type ShadowStore, type UserShadow } from '../core/shadow';
import { memorySocialStorage, type SocialStorage } from '../core/storage';
import { createSocialTaskQueue, type PendingSocialTask, type SocialTaskQueue } from '../core/tasks';
import { getToggleQueue } from '../core/toggleQueue';
import {
  isAuthError,
  isRetryableError,
  relationshipFailureCode,
  type RelationshipAction,
  type SocialNotice,
  type SocialTransport,
} from '../core/transport';
import type { RelationshipState, SocialUser } from '../core/types';







// -----------------------------------------------------------
// SocialEngineEnv
// -----------------------------------------------------------
//
// The context value — everything a hook reaches for, plus the
// offline task queue and its drain.
//
// Used by:
//   - useSocialEngine (below) — every hook reads this shape
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface SocialEngineEnv {
  transport: SocialTransport;
  // null = guest
  currentUser: SocialUser | null;
  // Engine → host messages; hosts map codes to translated strings
  notify: (notice: SocialNotice) => void;
  // A write attempted while signed out lands here — hosts open
  // their login flow. The default emits an 'auth_required' notice
  requireAuth: () => void;
  // The clock poll expiry compares against (frozen in tests)
  now: () => Date;
  postShadows: ShadowStore<PostShadow>;
  userShadows: ShadowStore<UserShadow>;
  // Every poll's newest known state, keyed by poll id — shared
  // by all usePoll instances (see core/poll.ts PollEntry)
  polls: ShadowStore<PollEntry>;
  // The activity list's word to the badge (mark-all-read)
  unread: UnreadSignal;
  // Where the offline task queue persists (default: memory —
  // in-session replay only)
  storage: SocialStorage;
  // Likes and relationship actions that failed on a HEALABLE
  // error wait here with their optimistic shadows standing
  taskQueue: SocialTaskQueue;
  // Drain the queue against the transport: the viewer's final
  // intent per target, once. Runs on mount and on the host's
  // restore signal; safe to call again any time
  replayTasks: () => Promise<void>;
}

// null marks "no provider above" — useSocialEngine turns it
// into a loud error rather than a half-working env
const SocialEngineContext = createContext<SocialEngineEnv | null>(null);







// -----------------------------------------------------------
// SocialEngineProvider
// -----------------------------------------------------------
//
// Shadow stores, the poll store, the unread signal and the
// task queue live in refs — one set per mount, surviving
// re-renders; an account change wipes them all. The queue
// drains on mount when signed in and on every network-restore
// signal, one drain at a time.
//
// Used by:
//   - the host app's root layout
//   - every test that mounts a hook
// -----------------------------------------------------------

export function SocialEngineProvider({
  transport,
  currentUser = null,
  notify,
  onRequireAuth,
  now,
  storage,
  onNetworkRestore,
  children,
}: {
  transport: SocialTransport;
  currentUser?: SocialUser | null;
  notify?: (notice: SocialNotice) => void;
  onRequireAuth?: () => void;
  now?: () => Date;
  // AsyncStorage-shaped; omitted, queued intents live for the
  // session only
  storage?: SocialStorage;
  // The host's restore signal (a data layer's onRestore, a
  // socket reconnect) — each firing drains the task queue
  onNetworkRestore?: (listener: () => void) => () => void;
  children: ReactNode;
}) {

  const postShadows = useRef<ShadowStore<PostShadow> | null>(null);
  if (postShadows.current === null) postShadows.current = createShadowStore<PostShadow>();
  const userShadows = useRef<ShadowStore<UserShadow> | null>(null);
  if (userShadows.current === null) userShadows.current = createShadowStore<UserShadow>();
  const pollStore = useRef<ShadowStore<PollEntry> | null>(null);
  if (pollStore.current === null) pollStore.current = createShadowStore<PollEntry>();
  const unreadSignal = useRef<UnreadSignal | null>(null);
  if (unreadSignal.current === null) unreadSignal.current = createUnreadSignal();
  const storageRef = useRef<SocialStorage | null>(null);
  if (storageRef.current === null) storageRef.current = storage ?? memorySocialStorage();
  const taskQueueRef = useRef<SocialTaskQueue | null>(null);
  if (taskQueueRef.current === null) taskQueueRef.current = createSocialTaskQueue(storageRef.current);
  // One drain at a time; a second signal mid-drain is folded in
  const replayingRef = useRef(false);


  // Callbacks ride in refs so a host passing inline closures
  // does not re-identify the env (and re-render every consumer)
  const notifyRef = useRef(notify);
  const authRef = useRef(onRequireAuth);
  useEffect(() => {
    notifyRef.current = notify;
    authRef.current = onRequireAuth;
  });


  const env = useMemo<SocialEngineEnv>(() => {
    const posts = postShadows.current as ShadowStore<PostShadow>;
    const users = userShadows.current as ShadowStore<UserShadow>;
    const queue = taskQueueRef.current as SocialTaskQueue;
    const notifyOut = (notice: SocialNotice) => notifyRef.current?.(notice);
    const requireAuth = () => {
      if (authRef.current) authRef.current();
      else notifyRef.current?.({ level: 'info', code: 'auth_required' });
    };


    // One parked like, replayed through the live lane's own
    // per-target toggle queue (see the file banner). The settle
    // mirrors useLikeToggle's: a newer tap queued behind the
    // replay (ctx.willContinue) leaves the shadow to it, else the
    // server's word lands. The outcome travels out in a holder —
    // the queue's promise only says the task finished
    const replayLike = async (task: Extract<PendingSocialTask, { type: 'like' }>, epoch: number): Promise<'next' | 'stop'> => {
      const id = task.target.id;
      const toggles = getToggleQueue<boolean>(transport, `like:${task.target.type}:${id}`);
      if (toggles.busy()) {
        queue.removeIfCurrent(task);
        return 'next';
      }

      const outcome: { failure: { err: unknown; superseded: boolean } | null } = { failure: null };
      await toggles
        .run(task.desired, async (desired, ctx) => {
          try {
            const result = await transport.setLiked(task.target, desired);
            if (posts.epoch() === epoch) {
              if (ctx.willContinue()) posts.patch(id, { confirmedLiked: result.liked, pending: true });
              else posts.patch(id, { liked: result.liked, confirmedLiked: result.liked, pending: false });
            }
            return result.liked;
          } catch (err) {
            outcome.failure = { err, superseded: ctx.willContinue() };
            throw err;
          }
        })
        .catch(() => {});
      if (posts.epoch() !== epoch) return 'stop';

      const failure = outcome.failure;
      if (!failure) {
        queue.removeIfCurrent(task);
        return 'next';
      }
      // A live tap that shared this call (same intent, deduped)
      // must not keep its pending flag up once it is settled here
      if (isAuthError(failure.err)) {
        if (!failure.superseded) posts.patch(id, { pending: false });
        requireAuth();
        return 'stop';
      }
      if (isRetryableError(failure.err)) {
        if (!failure.superseded) posts.patch(id, { pending: false });
        return 'stop';
      }
      // Definitive: this intent alone dies; a newer tap queued
      // behind it tells its own truth, so only the last word
      // reverts and notifies
      queue.removeIfCurrent(task);
      if (!failure.superseded) {
        posts.patch(id, { liked: posts.get(id)?.confirmedLiked, pending: false });
        notifyOut({ level: 'error', code: 'like_failed' });
      }
      return 'next';
    };


    // The relationship twin of replayLike, over the per-user
    // queue useRelationship runs its taps through
    const replayRelationship = async (
      task: Extract<PendingSocialTask, { type: 'relationship' }>,
      epoch: number,
    ): Promise<'next' | 'stop'> => {
      const setRelationship = transport.setRelationship?.bind(transport);
      if (!setRelationship) {
        queue.removeIfCurrent(task);
        return 'next';
      }
      const toggles = getToggleQueue<RelationshipAction | RelationshipState>(transport, `rel:${task.userId}`);
      if (toggles.busy()) {
        queue.removeIfCurrent(task);
        return 'next';
      }

      const outcome: { failure: { err: unknown; superseded: boolean } | null } = { failure: null };
      await toggles
        .run(task.action, async (action, ctx) => {
          try {
            const confirmed = await setRelationship(task.userId, action as RelationshipAction);
            if (posts.epoch() === epoch) {
              if (ctx.willContinue()) users.patch(task.userId, { confirmedRelationship: confirmed, pending: true });
              else users.patch(task.userId, { relationship: confirmed, confirmedRelationship: confirmed, pending: false });
            }
            return confirmed;
          } catch (err) {
            outcome.failure = { err, superseded: ctx.willContinue() };
            throw err;
          }
        })
        .catch(() => {});
      if (posts.epoch() !== epoch) return 'stop';

      const failure = outcome.failure;
      if (!failure) {
        queue.removeIfCurrent(task);
        return 'next';
      }
      if (isAuthError(failure.err)) {
        if (!failure.superseded) users.patch(task.userId, { pending: false });
        requireAuth();
        return 'stop';
      }
      if (isRetryableError(failure.err)) {
        if (!failure.superseded) users.patch(task.userId, { pending: false });
        return 'stop';
      }
      queue.removeIfCurrent(task);
      if (!failure.superseded) {
        users.patch(task.userId, { relationship: users.get(task.userId)?.confirmedRelationship, pending: false });
        notifyOut({ level: 'error', code: relationshipFailureCode(failure.err) });
      }
      return 'next';
    };


    // The drain: the viewer's FINAL intent per target, in the
    // order the intents were made, each through its target's
    // one serialising queue. A healable failure (the transport,
    // a 5xx) stops the walk and keeps the rest for the next
    // signal; an auth refusal stops it through the login flow; a
    // definitive refusal (every 4xx, 429 included) drops THAT
    // one task, reverts its shadow to the confirmed anchor, says
    // so once and walks on — one poisoned intent must never hold
    // the rest hostage. The walk runs over a snapshot, so an
    // entry the live lane purged or replaced since is skipped,
    // never replayed stale. An account switch mid-drain (the
    // store epochs move, the queue is cleared) ends the walk
    // without touching the fresh stores
    const replayTasks = async (): Promise<void> => {
      if (replayingRef.current) return;
      replayingRef.current = true;
      try {
        await queue.load();
        const epoch = posts.epoch();
        for (const task of queue.list()) {
          if (posts.epoch() !== epoch) return;
          if (!queue.isCurrent(task)) continue;
          const step = task.type === 'like' ? await replayLike(task, epoch) : await replayRelationship(task, epoch);
          if (step === 'stop') return;
        }
      } finally {
        replayingRef.current = false;
      }
    };


    return {
      transport,
      currentUser: currentUser ?? null,
      notify: notifyOut,
      requireAuth,
      now: now ?? (() => new Date()),
      postShadows: posts,
      userShadows: users,
      polls: pollStore.current as ShadowStore<PollEntry>,
      unread: unreadSignal.current as UnreadSignal,
      storage: storageRef.current as SocialStorage,
      taskQueue: queue,
      replayTasks,
    };
  }, [transport, currentUser, now]);


  // The account changed — the departing viewer's intents die
  // with them, queued ones included. The first render is
  // skipped (nothing to wipe)
  const previousAccountRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const account = currentUser?.id ?? null;
    if (previousAccountRef.current !== undefined && previousAccountRef.current !== account) {
      env.postShadows.clearAll();
      env.userShadows.clearAll();
      // A held poll carries the departing viewer's own vote
      env.polls.clearAll();
      env.taskQueue.clear();
    }
    previousAccountRef.current = account;
  }, [currentUser?.id, env]);


  // Intents from the LAST session (persisted storage) replay as
  // soon as a signed-in provider mounts; each restore signal
  // drains whatever gathered while offline
  useEffect(() => {
    if (env.currentUser) void env.replayTasks();
  }, [env]);
  useEffect(() => {
    if (!onNetworkRestore) return;
    return onNetworkRestore(() => {
      void env.replayTasks();
    });
  }, [onNetworkRestore, env]);


  return <SocialEngineContext.Provider value={env}>{children}</SocialEngineContext.Provider>;
}







// -----------------------------------------------------------
// useSocialEngine
// -----------------------------------------------------------
//
// Hands back the mounted env, or throws when no provider is
// above — hooks never run against a half-working default.
//
// Used by:
//   - every hook in the package
// -----------------------------------------------------------

export function useSocialEngine(): SocialEngineEnv {
  const env = useContext(SocialEngineContext);
  if (!env) throw new Error('useSocialEngine must be used inside <SocialEngineProvider>');
  return env;
}
