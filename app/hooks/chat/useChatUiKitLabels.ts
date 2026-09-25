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
//  Also home to systemEventText — the room-event wording both
//  the kit's system rows and the conversation list's preview
//  read, so the two can never word one event two ways.
//
//  Used by:
//    - components/chat/ChatUiKitHost.tsx
//    - components/chat/ConversationRow.tsx (systemEventText)
// -----------------------------------------------------------

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { KitLabels, KitSystemEvent } from '@knf/chatuikit';


// The translate function as systemEventText takes it —
// i18next's own signature is far wider than what it calls
type Translate = (key: string, opts?: Record<string, unknown>) => string;







// -----------------------------------------------------------
// systemEventText
// -----------------------------------------------------------
//
//   systemEventText(t, { event: 'ttl_on', seconds: 3600 }, 'Ona')
//     → 'Ona įjungė nykstančias žinutes (1 valanda)'
//
// A 'system' row's event worded through the chat.system*
// keys, the row's sender as the actor — or null for an event
// this build does not know (and a group event without its
// title), so the caller shows the backend's stored prose
// instead. The disappearing window reads in the largest unit
// that divides it exactly (7 days, 24 hours, 90 minutes),
// counted through the catalog's plural forms.
//
// Used by:
//   - useChatUiKitLabels (below) — the kit's systemMessage
//   - components/chat/ConversationRow.tsx — a system preview
// -----------------------------------------------------------

export function systemEventText(t: Translate, event: KitSystemEvent | null | undefined, name: string): string | null {
  if (!event) return null;
  if (event.event === 'group_created') return event.title ? t('chat.systemGroupCreated', { name, title: event.title }) : null;
  if (event.event === 'left') return t('chat.systemLeft', { name });
  if (event.event === 'ttl_off') return t('chat.systemTtlOff', { name });
  if (event.event === 'ttl_on' && typeof event.seconds === 'number' && event.seconds > 0) {
    const s = event.seconds;
    const window =
      s % 86_400 === 0
        ? t('chat.ttlDays', { count: s / 86_400 })
        : s % 3600 === 0
          ? t('chat.ttlHours', { count: s / 3600 })
          : t('chat.ttlMinutes', { count: Math.max(1, Math.round(s / 60)) });
    return t('chat.systemTtlOn', { name, window });
  }
  return null;
}







// -----------------------------------------------------------
// useChatUiKitLabels (default export)
// -----------------------------------------------------------
//
// Builds the complete KitLabels object — every field, plain
// strings plus the parameterised ones as closures over t() —
// memoised on t's identity, so a language switch mints a new
// object and the kit re-renders its strings.
//
// Used by:
//   - components/chat/ChatUiKitHost.tsx — the provider's labels
// -----------------------------------------------------------

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
      loadNewer: t('chat.loadNewer'),
      gallery: (count) => t('chat.galleryCount', { count }),
      voiceNote: t('chat.voiceNote'),
      recordVoice: t('chat.recordVoice'),
      sendVoice: t('chat.sendVoice'),
      cancelRecording: t('chat.cancelRecording'),
      playVoice: t('chat.playVoice'),
      pauseVoice: t('chat.pauseVoice'),
      mentionUser: (name) => t('chat.mentionUser', { name }),
      connecting: t('chat.connecting'),
      noConnection: t('chat.noConnection'),
      pinnedMessage: t('chat.pinnedMessage'),
      forwarded: t('chat.forwardedMark'),
      attachCamera: t('chat.attachCamera'),
      openAttachments: t('chat.openAttachments'),
      trayGallery: t('chat.trayGallery'),
      trayCamera: t('chat.trayCamera'),
      trayFile: t('chat.trayFile'),
      trayMemes: t('chat.trayMemes'),
      openMemes: t('chat.openMemes'),
      searchMemes: t('chat.searchMemes'),
      addMeme: t('chat.addMeme'),
      emptyMemes: t('chat.emptyMemes'),
      noMemeResults: t('chat.noMemeResults'),
      memesLoadError: t('chat.memesLoadError'),
      removeMeme: t('chat.removeMeme'),
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
      emptyChat: t('chat.emptyChat'),
      signInToChat: t('chat.signInToChat'),
      unsupportedMessage: t('chat.unsupportedMessage'),
      openProfile: t('chat.openProfile'),
      linkPreview: t('chat.linkPreview'),
      systemMessage: (event, name) => systemEventText(t, event, name),
    }),
    [t],
  );
}
