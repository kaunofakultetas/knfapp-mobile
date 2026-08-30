// -----------------------------------------------------------
//  [*] Tests — chatuikit Composer
//
//  The send slot's three faces and their labels, the reply and
//  editing strips, the guest lock, the attach buttons' busy and
//  disabled states, the counter near the limit, and the web
//  Enter rule (send / Shift+Enter newline / IME guard).
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));


import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Composer from '../Composer';
import { ChatUiKitProvider } from '../../provider';


const noop = () => {};
const base = {
  onChangeText: noop,
  onSend: noop,
  onQuickLike: noop,
  onAttachMedia: noop,
  onAttachFile: noop,
  onToggleEmoji: noop,
  emojiOpen: false,
  uploadingMedia: false,
  replyTo: null,
  onCancelReply: noop,
};
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider></SafeAreaProvider>);


describe('Composer', () => {
  it('shows the like face on an empty field, the send face with text, the check while editing', async () => {
    const onQuickLike = jest.fn();
    const onSend = jest.fn();
    const empty = await wrap(<Composer {...base} value="" onQuickLike={onQuickLike} onSend={onSend} />);
    await fireEvent.press(empty.getByRole('button', { name: 'Like' }));
    expect(onQuickLike).toHaveBeenCalledTimes(1);
    const typed = await wrap(<Composer {...base} value="labas" onSend={onSend} />);
    await fireEvent.press(typed.getByRole('button', { name: 'Send message' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    const editing = await wrap(<Composer {...base} value="" editing={{ id: 'm1', text: 'old' }} onSend={onSend} />);
    expect(editing.getByText('Editing message')).toBeTruthy();
    expect(editing.getByText('old')).toBeTruthy();
    // An emptied edit cannot be saved
    await fireEvent.press(editing.getByRole('button', { name: 'Save changes' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('renders the reply strip with the quoted kind and cancels it', async () => {
    const onCancelReply = jest.fn();
    const { getByText, getByRole } = await wrap(
      <Composer {...base} value="" replyTo={{ id: 'q', senderId: 'u2', senderName: 'Ona', text: '', deleted: false, kind: 'video' }} onCancelReply={onCancelReply} />,
    );
    expect(getByText('Ona')).toBeTruthy();
    expect(getByText('Video')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });

  it('a guest gets a locked field, inert buttons and the sign-in strip', async () => {
    const onSend = jest.fn();
    const onAttachMedia = jest.fn();
    const { getByTestId, getByText, getByRole } = await wrap(<Composer {...base} value="x" canSend={false} onSend={onSend} onAttachMedia={onAttachMedia} />);
    expect(getByText('Sign in to send messages')).toBeTruthy();
    expect(getByTestId('chatuikit-composer-input').props.editable).toBe(false);
    await fireEvent.press(getByTestId('chatuikit-send'));
    await fireEvent.press(getByRole('button', { name: 'Attach a photo or video' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(onAttachMedia).not.toHaveBeenCalled();
  });

  it('attach buttons show their busy state and step aside while editing', async () => {
    const busy = await wrap(<Composer {...base} value="" uploadingMedia uploadingFile />);
    expect(busy.getByRole('button', { name: 'Uploading…' })).toBeTruthy();
    expect(busy.getByRole('button', { name: 'Uploading file…' })).toBeTruthy();
    const onAttachFile = jest.fn();
    const editing = await wrap(<Composer {...base} value="t" editing={{ id: 'm', text: 't' }} onAttachFile={onAttachFile} />);
    await fireEvent.press(editing.getByRole('button', { name: 'Attach a file' }));
    expect(onAttachFile).not.toHaveBeenCalled();
  });

  it('shows the counter near the limit and passes textInputProps through without losing its own', async () => {
    const { getByText, getByTestId } = await wrap(<Composer {...base} value={'x'.repeat(4850)} maxLength={5000} textInputProps={{ autoFocus: true, testID: 'host-input' }} />);
    expect(getByText('4850/5000')).toBeTruthy();
    const input = getByTestId('host-input');
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.maxLength).toBe(5000);
    expect(input.props.multiline).toBe(true);
  });

  it('web: Enter sends, Shift+Enter and an IME confirmation do not', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      const onSend = jest.fn();
      const { getByTestId } = await wrap(<Composer {...base} value="labas" onSend={onSend} />);
      const input = getByTestId('chatuikit-composer-input');
      await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter', shiftKey: true }, preventDefault: noop });
      await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter', isComposing: true }, preventDefault: noop });
      await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter', keyCode: 229 }, preventDefault: noop });
      expect(onSend).not.toHaveBeenCalled();
      await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' }, preventDefault: noop });
      expect(onSend).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
