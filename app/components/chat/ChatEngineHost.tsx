// -----------------------------------------------------------
//  [*] Chat — ChatEngineHost
//
//  Mounts @knf/chatengine's provider with the app's pieces: the
//  KNF transport, the signed-in user, AsyncStorage for drafts
//  and the outbox, the network-restore signal, toasts for the
//  engine's notices (codes → the chat.* catalog), the video
//  poster extractor, and the backend's limits.
//
//  Used by:
//    - app/(main)/_layout.tsx — around the authenticated stack
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { chatTransport } from '@/services/chatTransport';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@/services/api';

import { ChatEngineProvider, type ChatUser, type EngineNotice } from '@knf/chatengine';
import { useDataEngine } from '@knf/dataengine';
import { DEFAULT_MAX_LENGTH } from '@knf/chatuikit/composer/Composer';


// Engine notice codes → the strings the app already has
const NOTICE_KEYS: Record<EngineNotice['code'], string> = {
  send_failed: 'chat.sendError',
  send_too_long: 'chat.sendTooLong',
  send_forbidden: 'chat.sendForbidden',
  session_expired: 'chat.sessionExpired',
  timeout: 'toast.timeout',
  upload_failed: 'chat.imageUploadError',
  upload_too_large: 'chat.fileTooLarge',
  edit_failed: 'chat.editError',
  delete_failed: 'chat.deleteError',
  load_older_failed: 'chat.loadError',
  reaction_target_gone: 'chat.reactionTargetGone',
  reaction_add_failed: 'chat.reactionAddError',
  reaction_remove_failed: 'chat.reactionRemoveError',
};

function noticeKey(notice: EngineNotice): string {
  if (notice.code === 'upload_failed') {
    return notice.detail === 'video' ? 'chat.videoUploadError' : notice.detail === 'file' ? 'chat.fileUploadError' : 'chat.imageUploadError';
  }
  if (notice.code === 'upload_too_large' && notice.detail === 'video_duration') return 'chat.videoTooLong';
  return NOTICE_KEYS[notice.code];
}


// Deliberately still the DEPRECATED thumbnails package: the
// engine uploads the poster, so a FILE URI is non-negotiable —
// the successor API returns a native image ref with no path,
// and converting one to a file would cost an extra dependency
// plus an imperative player lifecycle. Revisit only when the
// deprecated package actually stops shipping.
const makeVideoPoster = async (uri: string) => {
  const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.7 });
  return { uri: thumb.uri, width: thumb.width, height: thumb.height };
};

const limits = {
  maxMessageLength: DEFAULT_MAX_LENGTH,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  maxVideoBytes: MAX_VIDEO_UPLOAD_BYTES,
  maxVideoSeconds: 180,
};


export default function ChatEngineHost({ children }: { children: ReactNode }) {

  const { user } = useAuth();
  // The chat engine replays its outbox on the same restore bus
  // every offline-first screen listens to
  const { onRestore } = useDataEngine();
  const { t } = useTranslation();


  const currentUser = useMemo<ChatUser | null>(
    () => (user ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null),
    [user],
  );

  const notify = useCallback(
    (notice: EngineNotice) => showToast(notice.level === 'info' ? 'info' : 'error', t(noticeKey(notice))),
    [t],
  );


  return (
    <ChatEngineProvider
      transport={chatTransport}
      currentUser={currentUser}
      storage={AsyncStorage}
      notify={notify}
      onNetworkRestore={onRestore}
      makeVideoPoster={makeVideoPoster}
      limits={limits}
    >
      {children}
    </ChatEngineProvider>
  );
}
