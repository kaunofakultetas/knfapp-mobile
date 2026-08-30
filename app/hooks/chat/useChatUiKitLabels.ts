// -----------------------------------------------------------
//  [*] useChatUiKitLabels — the kit's strings from our catalog
//
//  The app's half of the chatuikit labels contract: every
//  KitLabels field mapped onto the `chat.*` (and two `common.*`)
//  keys of the i18n catalog, memoised per language. Handed to
//  ChatUiKitProvider by ChatUiKitHost; the kit itself never calls
//  t(). Adding a string to the kit means adding a key here and
//  in both catalogs — the labels test walks every field.
//
//  Used by:
//    - components/chat/ChatUiKitHost.tsx
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { KitLabels } from '@knf/chatuikit';


export default function useChatUiKitLabels(): KitLabels {

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
      unreadMessages: t('chat.unreadMessages'),
      file: t('chat.fileMessage'),
      video: t('chat.videoMessage'),
      videoUnavailable: t('chat.videoUnavailable'),
      playVideo: t('chat.playVideo'),
      attachMedia: t('chat.attachMedia'),
      attachFile: t('chat.attachFile'),
      uploadingMedia: t('chat.uploadingMedia'),
      uploadingFile: t('chat.uploadingFile'),
      edited: t('chat.edited'),
      editingMessage: t('chat.editingMessage'),
      cancelEdit: t('chat.cancelEdit'),
      saveEdit: t('chat.saveEdit'),
    }),
    [t],
  );
}
