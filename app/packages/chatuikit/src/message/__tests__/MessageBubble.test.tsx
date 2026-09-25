// -----------------------------------------------------------
//  [*] Tests — chatuikit MessageBubble kinds and accessibility
//
//  A custom kind renders through the host's MessageBody slot
//  and the unsupported placeholder without it; an unknown kind
//  renders the placeholder; the row's composed accessibility
//  label and its actions; the portrait's tap; a document's
//  stored path reaching the host's link opener resolved, from
//  the card's tap and from the openFile action alike.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));

jest.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const gesture: Record<string, unknown> = {};
    const chain = () => gesture;
    for (const method of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'minDistance', 'hitSlop']) gesture[method] = chain;
    return gesture;
  };
  return { Gesture: { Pan: builder, Tap: builder, LongPress: builder }, GestureDetector: ({ children }: { children: unknown }) => children };
});

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { KitMessage } from '../../core/types';
import { ChatUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import MessageBubble from '../MessageBubble';


const labels = defaultLabels.en;
const noop = () => {};
const base = (over: Partial<KitMessage>): KitMessage => ({
  id: 'm1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: '2026-08-27T10:00:00Z', isOwn: false, status: 'read', reactions: [], ...over,
});
const props = {
  position: 'single' as const, showSender: true, avatarSlot: 'show' as const, timeRevealed: false, showStatus: false, highlighted: false, animateIn: false, hidden: false,
  canAct: true, canReply: true, labels, onPress: noop, onLongPress: noop, onSwipeReply: noop, onPressQuote: noop, onPressImage: noop, onPressReactions: noop, onRetry: noop, onPressLink: noop,
};
const wrap = (ui: React.ReactElement, components = {}) => render(<ChatUiKitProvider locale="en" components={components}>{ui}</ChatUiKitProvider>);


describe('MessageBubble kinds', () => {
  it('renders a custom kind through the MessageBody slot, else the unsupported placeholder', async () => {
    const Body = ({ message }: { message: KitMessage }) => <Text>{`poll:${String((message.custom as { q: string }).q)}`}</Text>;
    const custom = base({ kind: 'custom', text: '', custom: { q: 'Kada?' } });
    const withSlot = await wrap(<MessageBubble {...props} message={custom} />, { MessageBody: Body });
    expect(withSlot.getByText('poll:Kada?')).toBeTruthy();
    const withoutSlot = await wrap(<MessageBubble {...props} message={custom} />);
    expect(withoutSlot.getByTestId('chatuikit-unsupported')).toBeTruthy();
    const unknown = await wrap(<MessageBubble {...props} message={base({ kind: 'hologram' as never, text: 'x' })} />);
    expect(unknown.getByText('This message cannot be shown in this version')).toBeTruthy();
  });

  it('composes the accessibility label and lists the gestures as actions', async () => {
    const { getByLabelText } = await wrap(
      <MessageBubble {...props} message={base({ text: 'see https://knf.vu.lt', editedAt: '2026-08-27T10:05:00Z', replyTo: { id: 'q', senderId: 'u1', senderName: 'Me', text: 'q', deleted: false } })} showStatus />,
    );
    const row = getByLabelText(/^Ona, see https:\/\/knf\.vu\.lt, \d{2}:\d{2}, edited$/);
    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['reply', 'react', 'copy', 'messageActions', 'jumpToQuoted', 'openLink:0']);
  });

  it('a portrait tap reaches the host with the message', async () => {
    const onPressAvatar = jest.fn();
    const message = base({});
    const { getByRole } = await wrap(<MessageBubble {...props} message={message} onPressAvatar={onPressAvatar} />);
    await fireEvent.press(getByRole('button', { name: 'Open profile, Ona' }));
    expect(onPressAvatar).toHaveBeenCalledWith(message);
  });
});


describe('MessageBubble document card', () => {
  // The kit env's resolver, as the host wires it: a stored
  // upload path becomes an absolute URL
  const resolveImageUrl = (path: string) => (path.startsWith('/') ? `https://api.test${path}` : path);
  const document = base({ kind: 'file', text: '', file: { name: 'report.pdf', uri: '/api/uploads/report.pdf', size: 12_000, mimeType: 'application/pdf' } });

  it('the card tap hands the host an absolute URL, never the bare upload path', async () => {
    const onPressLink = jest.fn();
    const { getByLabelText } = await render(
      <ChatUiKitProvider locale="en" resolveImageUrl={resolveImageUrl}>
        <MessageBubble {...props} message={document} onPressLink={onPressLink} />
      </ChatUiKitProvider>,
    );
    await fireEvent.press(getByLabelText(/^File: report\.pdf/));
    expect(onPressLink).toHaveBeenCalledWith('https://api.test/api/uploads/report.pdf');
  });

  it('the openFile accessibility action resolves the same way', async () => {
    const onPressLink = jest.fn();
    const { getByLabelText } = await render(
      <ChatUiKitProvider locale="en" resolveImageUrl={resolveImageUrl}>
        <MessageBubble {...props} message={document} onPressLink={onPressLink} />
      </ChatUiKitProvider>,
    );
    const row = getByLabelText(/^Ona, /);
    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toContain('openFile');
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'openFile' } });
    expect(onPressLink).toHaveBeenCalledWith('https://api.test/api/uploads/report.pdf');
  });
});
