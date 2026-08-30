// -----------------------------------------------------------
//  [*] chatkit — labels
//
//  Every string the kit shows, gathered behind one hook so the
//  i18n coupling is a single file: the host app supplies them
//  from its `chat.*` catalog here, and a future extraction of
//  the kit replaces this file with a labels prop. Components
//  never call t() themselves — only the kit's ROOTS call the
//  hook (one i18next subscription each) and thread the object
//  down as a prop, so a window of message rows never carries a
//  subscription per leaf.
//
//  Used by:
//    - chatkit/MessageList.tsx    — threads into every row
//    - chatkit/Composer.tsx       — threads into its slots
//    - chatkit/MessageContextMenu.tsx
//    - chatkit/RoomHeaderTitle.tsx
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';


export interface KitLabels {
  today: string;
  yesterday: string;
  photo: string;
  imageUnavailable: string;
  deleted: string;
  sending: string;
  sent: string;
  delivered: string;
  read: string;
  notSent: string;
  tryAgain: string;
  reply: string;
  replyingTo: (name: string) => string;
  cancelReply: string;
  jumpToQuoted: string;
  copy: string;
  delete: string;
  react: string;
  removeReaction: string;
  reactions: string;
  messageActions: string;
  showTime: string;
  online: string;
  close: string;
  latestMessages: string;
  newMessages: (count: number) => string;
  loadOlder: string;
  conversationStart: string;
  inputPlaceholder: string;
  send: string;
  quickLike: string;
  attachPhoto: string;
  uploadingPhoto: string;
  chooseEmoji: string;
  openLink: string;
}


export function useKitLabels(): KitLabels {
  const { t } = useTranslation();

  return useMemo<KitLabels>(
    () => ({
      today: t('chat.today'),
      yesterday: t('chat.yesterday'),
      photo: t('chat.photoMessage'),
      imageUnavailable: t('chat.imageUnavailable'),
      deleted: t('chat.deleted'),
      sending: t('chat.sending'),
      sent: t('chat.sent'),
      delivered: t('chat.delivered'),
      read: t('chat.read'),
      notSent: t('chat.sendFailed'),
      tryAgain: t('common.tryAgain'),
      reply: t('chat.reply'),
      replyingTo: (name) => t('chat.replyingTo', { name }),
      cancelReply: t('chat.cancelReply'),
      jumpToQuoted: t('chat.jumpToQuoted'),
      copy: t('chat.copy'),
      delete: t('chat.delete'),
      react: t('chat.react'),
      removeReaction: t('chat.removeReaction'),
      reactions: t('chat.reactionsTitle'),
      messageActions: t('chat.messageActions'),
      showTime: t('chat.showTime'),
      online: t('chat.online'),
      close: t('common.close'),
      latestMessages: t('chat.scrollToLatest'),
      newMessages: (count) => t('chat.newMessages', { count }),
      loadOlder: t('chat.loadOlder'),
      conversationStart: t('chat.conversationStart'),
      inputPlaceholder: t('chat.inputPlaceholder'),
      send: t('chat.send'),
      quickLike: t('chat.quickLike'),
      attachPhoto: t('chat.attachImage'),
      uploadingPhoto: t('chat.uploadingImage'),
      chooseEmoji: t('chat.chooseEmoji'),
      openLink: t('chat.openLink'),
    }),
    [t],
  );
}
