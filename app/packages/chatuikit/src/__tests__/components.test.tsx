// -----------------------------------------------------------
//  [*] Tests — chatuikit components
//
//  Render-level pins for the rules MessageList and
//  MessageBubble carry: the group-position props map to what
//  a row actually shows (sender name, portrait, receipt,
//  unsent placeholder), and rows are keyed by clientId so the
//  temp → server swap never remounts a bubble.
// -----------------------------------------------------------

// Every string the kit could ask for — handed straight to the
// bubble as its labels prop, and served by the labels-module
// mock for MessageList's own useKitLabels call
const mockKitLabels = {
  today: 'Today', yesterday: 'Yesterday', photo: 'Photo', deleted: 'Unsent message',
  sending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read',
  notSent: 'Not sent', tryAgain: 'Try again', reply: 'Reply',
  replyingTo: (name: string) => `Replying to ${name}`, cancelReply: 'Cancel reply',
  jumpToQuoted: 'Jump to quoted', copy: 'Copy', delete: 'Delete', react: 'React',
  removeReaction: 'Remove reaction', reactions: 'Reactions', messageActions: 'Message actions',
  showTime: 'Show time', online: 'Online', close: 'Close', latestMessages: 'Latest messages',
  newMessages: (count: number) => `${count} new`, loadOlder: 'Older messages', loadNewer: 'Newer messages', gallery: (count: number) => `Album ${count}`,
  conversationStart: 'Conversation start', inputPlaceholder: 'Message', send: 'Send',
  quickLike: 'Like', attachPhoto: 'Attach photo', uploadingPhoto: 'Uploading photo',
  video: 'Video', videoUnavailable: 'Video unavailable', playVideo: 'Play video', attachMedia: 'Attach media', attachFile: 'Attach file',
  uploadingMedia: 'Uploading', uploadingFile: 'Uploading file', edited: 'edited', editingMessage: 'Editing message', cancelEdit: 'Cancel edit', saveEdit: 'Save',
  chooseEmoji: 'Choose emoji', openLink: 'Open link', imageUnavailable: 'Image unavailable',
  unreadMessages: 'New messages', file: 'File',
  emptyChat: 'No messages', signInToChat: 'Sign in', unsupportedMessage: 'Unsupported', openProfile: 'Open profile', linkPreview: 'Link preview',
  voiceNote: 'Voice message', recordVoice: 'Record', sendVoice: 'Send voice', cancelRecording: 'Discard', playVoice: 'Play', pauseVoice: 'Pause', mentionUser: (name: string) => `Mention ${name}`,
  connecting: 'Connecting…', noConnection: 'No connection', pinnedMessage: 'Pinned message', forwarded: 'Forwarded', attachCamera: 'Camera',
};

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const gesture: Record<string, unknown> = {};
    const chain = () => gesture;
    for (const method of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'minDistance', 'hitSlop']) {
      gesture[method] = chain;
    }
    return gesture;
  };
  return {
    Gesture: { Pan: builder, Tap: builder, LongPress: builder },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});
jest.mock('../provider', () => ({
  ...jest.requireActual('../provider'),
  useKitLabels: () => mockKitLabels,
}));

import { render } from '@testing-library/react-native';

import MessageBubble from '../message/MessageBubble';
import MessageList, { keyExtractor } from '../list/MessageList';
import { buildTimeline } from '../core/timeline';
import type { KitMessage } from '../core/types';

// The host's message type: the kit's contract plus what a host adds
type ChatMessage = KitMessage & { conversationId: string };


const LABELS = { today: 'Today', yesterday: 'Yesterday', locale: 'en-GB' };
const BASE = Date.UTC(2026, 7, 27, 10, 0, 0);

function message(id: string, senderId: string, offsetMs: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    conversationId: 'c',
    senderId,
    senderName: senderId,
    text: `text-${id}`,
    createdAt: new Date(BASE + offsetMs).toISOString(),
    isOwn: senderId === 'me',
    status: 'sent',
    reactions: [],
    ...extra,
  };
}

const noop = () => {};

const bubbleDefaults = {
  timeRevealed: false,
  highlighted: false,
  animateIn: false,
  hidden: false,
  canAct: true,
  canReply: true,
  labels: mockKitLabels,
  onPress: noop,
  onLongPress: noop,
  onSwipeReply: noop,
  onPressQuote: noop,
  onPressImage: noop,
  onPressReactions: noop,
  onRetry: noop,
  onPressLink: noop,
};


describe('MessageBubble', () => {

  it('shows the sender name and portrait only where the row asks', async () => {
    const msg = message('m1', 'them', 0);
    const view = await render(
      <MessageBubble message={msg} position="first" showSender avatarSlot="blank" showStatus={false} {...bubbleDefaults} />,
    );
    expect(view.getByText('them')).toBeTruthy();
    // 'blank' reserves the column without drawing the portrait
    expect(view.queryByText('T')).toBeNull();

    await view.rerender(
      <MessageBubble message={msg} position="last" showSender={false} avatarSlot="show" showStatus={false} {...bubbleDefaults} />,
    );
    expect(view.queryByText('them')).toBeNull();
    expect(view.getByText('T')).toBeTruthy();
  });


  it('shows the delivery receipt only on the marked own row', async () => {
    const msg = message('m2', 'me', 0, { status: 'read' });
    const view = await render(
      <MessageBubble message={msg} position="single" showSender={false} avatarSlot="none" showStatus {...bubbleDefaults} />,
    );
    expect(view.getByText('Read')).toBeTruthy();

    await view.rerender(
      <MessageBubble message={msg} position="single" showSender={false} avatarSlot="none" showStatus={false} {...bubbleDefaults} />,
    );
    expect(view.queryByText('Read')).toBeNull();
  });


  it('renders the unsent placeholder instead of the body for a deleted message', async () => {
    const msg = message('m3', 'them', 0, { deleted: true });
    const view = await render(
      <MessageBubble message={msg} position="single" showSender={false} avatarSlot="none" showStatus={false} {...bubbleDefaults} />,
    );
    expect(view.getByText('Unsent message')).toBeTruthy();
    expect(view.queryByText('text-m3')).toBeNull();
  });

});


describe('MessageList', () => {

  it('keys rows by clientId so the temp → server swap never remounts', async () => {
    const items = buildTimeline(
      [message('srv-2', 'me', 60_000, { clientId: 'tmp-abc' }), message('srv-1', 'them', 0)],
      LABELS,
    );
    const view = await render(
      <MessageList
        items={items}
        typing={null}
        isGroup={false}
        showAvatars={false}
        intro={null}
        loadingOlder={false}
        hasMore={false}
        onLoadOlder={noop}
        revealedId={null}
        highlightedId={null}
        menuTargetId={null}
        canAct={() => true}
        canReply={() => true}
        onPressMessage={noop}
        onLongPressMessage={noop}
        onSwipeReply={noop}
        onPressQuote={noop}
        onPressImage={noop}
        onPressReactions={noop}
        onRetry={noop}
        onPressLink={noop}
      />,
    );

    const keys = items.map((row) => keyExtractor(row));
    expect(keys).toEqual(['tmp-abc', 'srv-1', 'sep-srv-1']);
    expect(new Set(keys).size).toBe(keys.length);

    // Both bubbles actually rendered under those keys
    expect(view.getByText('text-srv-2')).toBeTruthy();
    expect(view.getByText('text-srv-1')).toBeTruthy();
  });

});
