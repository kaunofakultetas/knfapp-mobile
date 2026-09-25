// -----------------------------------------------------------
//  [*] Tests — the Messages tab's preview line
//
//  A row's second line names what the last message IS: a
//  caption-less video, voice note or file by its kind (a voice
//  note once previewed as "Photo" — KNF-123), a system line in
//  the READER's language from its event (KNF-126), and a row
//  patched from a live socket message reads EXACTLY like the
//  same message refetched over REST (the patch once dropped
//  the kind, so a live video read "Photo" — KNF-095).
// -----------------------------------------------------------

import i18next, { type TFunction } from 'i18next';

import { conversationPreview, patchWithNewMessage } from '@/components/chat/conversationList';
import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';
import type { ApiConversation } from '@/services/api';
import type { SocketMessage } from '@/services/socket';







// -----------------------------------------------------------
// translatorFor
// -----------------------------------------------------------
//
// A translate function over the real catalogs, one language.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function translatorFor(lng: 'lt' | 'en'): TFunction {
  const instance = i18next.createInstance();
  void instance.init({
    resources: { lt: { translation: lt }, en: { translation: en } },
    lng,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return instance.t;
}







// -----------------------------------------------------------
// room
// -----------------------------------------------------------
//
// A group row as the REST list answers it, with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function room(over: Partial<ApiConversation> = {}): ApiConversation {
  return {
    id: 'c1', type: 'group', title: 'KNF', pinned: false, unreadCount: 0, lastUpdatedMs: 0,
    participants: [{ id: 'me', displayName: 'Tomas' }, { id: 'u2', displayName: 'Ona' }],
    ...over,
  };
}







// -----------------------------------------------------------
// live
// -----------------------------------------------------------
//
// A new_message socket payload from Ona, with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function live(over: Partial<SocketMessage> = {}): SocketMessage {
  return {
    id: 'm9', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: '', time: '10:00',
    createdAt: '2026-09-19T10:00:00.123456', isOwn: false, reactions: [], ...over,
  };
}


describe.each(['lt', 'en'] as const)('conversationPreview — %s', (lng) => {
  const t = translatorFor(lng);

  it('names a caption-less message by its kind — a voice note is never a photo', () => {
    const line = (kind: NonNullable<ApiConversation['lastMessage']>['kind']) =>
      conversationPreview(room({ lastMessage: { id: 'x', text: '', kind, time: '', senderId: 'u2', senderName: 'Ona' } }), 'me', t);
    expect(line('audio')).toBe(`Ona: ${t('chat.voiceNote')}`);
    expect(line('video')).toBe(`Ona: ${t('messages.videoMessage')}`);
    expect(line('file')).toBe(`Ona: ${t('messages.fileMessage')}`);
    expect(line('image')).toBe(`Ona: ${t('messages.photoMessage')}`);
    expect(line('audio')).not.toBe(line('image'));
  });

  it('words a system line from its event, with no sender prefix', () => {
    const line = conversationPreview(room({
      lastMessage: { id: 's', text: 'Ona paliko pokalbį', kind: 'system', system: { event: 'left' }, time: '', senderId: 'u2', senderName: 'Ona' },
    }), 'me', t);
    expect(line).toBe(t('chat.systemLeft', { name: 'Ona' }));
    expect(line.startsWith('Ona: ')).toBe(false);
  });

  it('an old system line without an event keeps its stored text', () => {
    const line = conversationPreview(room({
      lastMessage: { id: 's', text: 'Ona sukūrė grupę „KNF“', kind: 'system', time: '', senderId: 'u2', senderName: 'Ona' },
    }), 'me', t);
    expect(line).toBe('Ona sukūrė grupę „KNF“');
  });

  it('prefixes own messages, blanks unsent ones and invites a first message', () => {
    expect(conversationPreview(room({ lastMessage: { id: 'o', text: 'labas', kind: 'text', time: '', senderId: 'me', senderName: 'Tomas' } }), 'me', t))
      .toBe(`${t('messages.youPrefix')} labas`);
    expect(conversationPreview(room({ type: 'direct', lastMessage: { id: 'd', text: '', deleted: true, time: '', senderId: 'u2', senderName: 'Ona' } }), 'me', t))
      .toBe(t('messages.deletedPreview'));
    expect(conversationPreview(room(), 'me', t)).toBe(t('messages.tapToStart'));
  });

  it('a live-patched row previews exactly like the same message over REST', () => {
    for (const kind of ['video', 'file', 'audio', 'image'] as const) {
      const socket = live({ kind, attachment: kind === 'image' ? null : { url: '/api/uploads/a', name: 'a', size: 1, mime: 'x' } });
      const patched = patchWithNewMessage(room(), socket, 'me', null);
      const rest = room({ lastMessage: { id: 'm9', text: '', kind, time: '10:00', senderId: 'u2', senderName: 'Ona', deleted: false } });
      expect(conversationPreview(patched, 'me', t)).toBe(conversationPreview(rest, 'me', t));
    }
    const system = patchWithNewMessage(room(), live({ kind: 'system', text: 'Ona paliko pokalbį', system: { event: 'left' } }), 'me', null);
    expect(conversationPreview(system, 'me', t)).toBe(t('chat.systemLeft', { name: 'Ona' }));
  });
});


describe('patchWithNewMessage', () => {
  it('counts a foreign message as unread, never an own one, the open room\'s or a system line', () => {
    expect(patchWithNewMessage(room(), live(), 'me', null).unreadCount).toBe(1);
    expect(patchWithNewMessage(room(), live({ senderId: 'me' }), 'me', null).unreadCount).toBe(0);
    expect(patchWithNewMessage(room(), live(), 'me', 'c1').unreadCount).toBe(0);
    expect(patchWithNewMessage(room(), live({ kind: 'system', system: { event: 'left' } }), 'me', null).unreadCount).toBe(0);
  });

  it('ages the row by the SERVER stamp, not the device clock', () => {
    const patched = patchWithNewMessage(room(), live({ createdAt: '2026-09-19T10:00:00.123456' }), 'me', null);
    expect(patched.lastUpdatedMs).toBe(Date.UTC(2026, 8, 19, 10, 0, 0, 123));
  });
});
