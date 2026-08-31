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
//  The shadow stores are wiped whenever the signed-in account
//  CHANGES (including to/from guest): one account's optimistic
//  intents must never bleed into the next one's rows.
//
//  now() exists so poll expiry is testable — hosts never pass
//  it, tests freeze it.
//
//  Used by:
//    - every hook in the package
// -----------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { createShadowStore, type PostShadow, type ShadowStore, type UserShadow } from '../core/shadow';
import { memorySocialStorage, type SocialStorage } from '../core/storage';
import { createSocialTaskQueue, type SocialTaskQueue } from '../core/tasks';
import { isAuthError, isRetryableError, type SocialNotice, type SocialTransport } from '../core/transport';
import type { SocialUser } from '../core/types';


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

const SocialEngineContext = createContext<SocialEngineEnv | null>(null);







// -----------------------------------------------------------
// SocialEngineProvider
// -----------------------------------------------------------
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


    // The drain: the viewer's FINAL intent per target, in the
    // order the intents were made. A healable failure stops the
    // walk and keeps the rest for the next signal; an auth
    // refusal stops it through the login flow; a definitive
    // refusal drops that one task, reverts its shadow to the
    // confirmed anchor and says so once. An account switch mid-
    // drain (the store epochs move, the queue is cleared) ends
    // the walk without touching the fresh stores
    const replayTasks = async (): Promise<void> => {
      if (replayingRef.current) return;
      replayingRef.current = true;
      try {
        await queue.load();
        const epoch = posts.epoch();
        for (const task of queue.list()) {
          if (posts.epoch() !== epoch) return;
          try {
            if (task.type === 'like') {
              const result = await transport.setLiked(task.target, task.desired);
              if (posts.epoch() !== epoch) return;
              posts.patch(task.target.id, { liked: result.liked, confirmedLiked: result.liked, pending: false });
            } else {
              const setRelationship = transport.setRelationship;
              if (!setRelationship) {
                queue.remove(task);
                continue;
              }
              const confirmed = await setRelationship(task.userId, task.action);
              if (posts.epoch() !== epoch) return;
              users.patch(task.userId, { relationship: confirmed, confirmedRelationship: confirmed, pending: false });
            }
            queue.remove(task);
          } catch (err) {
            if (posts.epoch() !== epoch) return;
            if (isAuthError(err)) {
              requireAuth();
              return;
            }
            if (isRetryableError(err)) return;
            queue.remove(task);
            if (task.type === 'like') {
              posts.patch(task.target.id, { liked: posts.get(task.target.id)?.confirmedLiked, pending: false });
              notifyOut({ level: 'error', code: 'like_failed' });
            } else {
              users.patch(task.userId, { relationship: users.get(task.userId)?.confirmedRelationship, pending: false });
              notifyOut({ level: 'error', code: 'relationship_failed' });
            }
          }
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
// Used by:
//   - every hook in the package
// -----------------------------------------------------------

export function useSocialEngine(): SocialEngineEnv {
  const env = useContext(SocialEngineContext);
  if (!env) throw new Error('useSocialEngine must be used inside <SocialEngineProvider>');
  return env;
}
