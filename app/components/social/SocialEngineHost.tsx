// -----------------------------------------------------------
//  [*] SocialEngineHost — the app's SocialEngineProvider
//
//  Mounts @knf/socialengine once for every screen below the
//  (main) layout: the KNF transport, the signed-in viewer (or
//  null — the engine works signed out), AsyncStorage for the
//  offline task queue, the data engine's restore bus so queued
//  likes replay when connectivity returns, the engine's notice
//  codes mapped onto the catalog strings the screens already
//  toast, and the login route (with returnTo) for a write
//  attempted while signed out.
//
//  Used by:
//    - app/(main)/_layout.tsx
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { useReturnHref } from '@/hooks/useReturnHref';
import { socialTransport } from '@/services/socialTransport';

import { useDataEngine } from '@knf/dataengine';
import { SocialEngineProvider, type SocialNotice, type SocialUser } from '@knf/socialengine';


// Engine notice codes → the strings the app already has
const NOTICE_KEYS: Record<SocialNotice['code'], string> = {
  like_failed: 'news.likeError',
  vote_failed: 'news.pollVoteError',
  poll_load_failed: 'social.pollLoadError',
  relationship_failed: 'profile.actionError',
  block_failed: 'profile.actionError',
  report_failed: 'profile.actionError',
  notifications_failed: 'social.activityError',
  auth_required: 'social.signInRequired',
};


export default function SocialEngineHost({ children }: { children: ReactNode }) {

  const { user } = useAuth();
  const { onRestore } = useDataEngine();
  const { t } = useTranslation();
  const returnTo = useReturnHref();


  const currentUser = useMemo<SocialUser | null>(
    () => (user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null } : null),
    [user],
  );

  const notify = useCallback(
    (notice: SocialNotice) => showToast(notice.level === 'info' ? 'info' : 'error', t(NOTICE_KEYS[notice.code])),
    [t],
  );

  // A guest tapped like / vote / connect: the login screen, and
  // back to exactly here afterwards
  const onRequireAuth = useCallback(() => {
    router.push({ pathname: '/login', params: { returnTo } });
  }, [returnTo]);


  return (
    <SocialEngineProvider
      transport={socialTransport}
      currentUser={currentUser}
      storage={AsyncStorage}
      notify={notify}
      onRequireAuth={onRequireAuth}
      onNetworkRestore={onRestore}
    >
      {children}
    </SocialEngineProvider>
  );
}
