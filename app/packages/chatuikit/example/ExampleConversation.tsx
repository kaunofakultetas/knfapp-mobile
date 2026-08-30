// -----------------------------------------------------------
//  [*] chatuikit — example
//
//  The kit with no host app behind it: a fake three-message
//  conversation, the default theme and English labels, and
//  no-op callbacks. Render this anywhere (a route, a story, a
//  test) to see the kit working in isolation — and to see the
//  complete list of what a host has to hand in.
// -----------------------------------------------------------

import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  buildTimeline,
  ChatUiKitProvider,
  Composer,
  defaultLabels,
  MessageList,
  type KitMessage,
} from '../src';


const NOW = Date.now();

const MESSAGES: KitMessage[] = [
  {
    id: '3', senderId: 'me', senderName: 'Me', text: 'Works with no host at all.',
    createdAt: new Date(NOW - 60_000).toISOString(), isOwn: true, status: 'read', reactions: [],
  },
  {
    id: '2', senderId: 'ona', senderName: 'Ona', text: 'Is the kit really standalone?',
    createdAt: new Date(NOW - 120_000).toISOString(), isOwn: false, status: 'sent',
    reactions: [{ emoji: '👍', count: 1, bySelf: true, byUserIds: ['me'] }],
  },
  {
    id: '1', senderId: 'ona', senderName: 'Ona', text: 'Labas!',
    createdAt: new Date(NOW - 180_000).toISOString(), isOwn: false, status: 'sent', reactions: [],
  },
];


export default function ExampleConversation() {

  const [draft, setDraft] = useState('');
  const labels = defaultLabels.en;
  const timeline = useMemo(
    () => buildTimeline(MESSAGES, { today: labels.today, yesterday: labels.yesterday, locale: 'en' }),
    [labels],
  );


  return (
    <ChatUiKitProvider labels={labels} locale="en">
      <View style={{ flex: 1 }}>
        <MessageList
          items={timeline}
          typing={null}
          isGroup={false}
          showAvatars
          intro={{ title: 'Ona', subtitle: 'Example', isGroup: false }}
          loadingOlder={false}
          hasMore={false}
          onLoadOlder={() => {}}
          revealedId={null}
          highlightedId={null}
          menuTargetId={null}
          canAct={() => false}
          canReply={() => false}
          onPressMessage={() => {}}
          onLongPressMessage={() => {}}
          onSwipeReply={() => {}}
          onPressQuote={() => {}}
          onPressReactions={() => {}}
          onPressImage={() => {}}
          onRetry={() => {}}
          onPressLink={() => {}}
          isFocused
          onCopy={() => {}}
          onReact={() => {}}
        />
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={() => setDraft('')}
          onQuickLike={() => {}}
          onAttachMedia={() => {}}
          onToggleEmoji={() => {}}
          emojiOpen={false}
          uploadingMedia={false}
          replyTo={null}
          onCancelReply={() => {}}
        />
      </View>
    </ChatUiKitProvider>
  );
}
