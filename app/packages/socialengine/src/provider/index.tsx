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
import type { SocialNotice, SocialTransport } from '../core/transport';
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
  children,
}: {
  transport: SocialTransport;
  currentUser?: SocialUser | null;
  notify?: (notice: SocialNotice) => void;
  onRequireAuth?: () => void;
  now?: () => Date;
  children: ReactNode;
}) {

  const postShadows = useRef<ShadowStore<PostShadow> | null>(null);
  if (postShadows.current === null) postShadows.current = createShadowStore<PostShadow>();
  const userShadows = useRef<ShadowStore<UserShadow> | null>(null);
  if (userShadows.current === null) userShadows.current = createShadowStore<UserShadow>();


  // Callbacks ride in refs so a host passing inline closures
  // does not re-identify the env (and re-render every consumer)
  const notifyRef = useRef(notify);
  const authRef = useRef(onRequireAuth);
  useEffect(() => {
    notifyRef.current = notify;
    authRef.current = onRequireAuth;
  });


  const env = useMemo<SocialEngineEnv>(
    () => ({
      transport,
      currentUser: currentUser ?? null,
      notify: (notice) => notifyRef.current?.(notice),
      requireAuth: () => {
        if (authRef.current) authRef.current();
        else notifyRef.current?.({ level: 'info', code: 'auth_required' });
      },
      now: now ?? (() => new Date()),
      postShadows: postShadows.current as ShadowStore<PostShadow>,
      userShadows: userShadows.current as ShadowStore<UserShadow>,
    }),
    [transport, currentUser, now],
  );


  // The account changed — the departing viewer's intents die
  // with them. The first render is skipped (nothing to wipe)
  const previousAccountRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const account = currentUser?.id ?? null;
    if (previousAccountRef.current !== undefined && previousAccountRef.current !== account) {
      env.postShadows.clearAll();
      env.userShadows.clearAll();
    }
    previousAccountRef.current = account;
  }, [currentUser?.id, env]);


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
