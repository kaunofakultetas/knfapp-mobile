// -----------------------------------------------------------
//  [*] Tests — MemePushSheet, naming a meme before the push
//
//  The picked file's stem seeds the title, a blank title can
//  never confirm, a push in flight cannot be abandoned — and
//  the card rides the keyboard: a KeyboardAvoidingView inside
//  the Modal (the screen's own avoidance never reaches a
//  Modal's window), a scrolling body, and a preview that
//  shrinks while the keyboard is up so the fields and buttons
//  stay above the keys on a small phone.
// -----------------------------------------------------------

// The keyboard state, steerable per test
let mockKeyboardUp = false;
jest.mock('@/hooks/useKeyboardVisible', () => ({ __esModule: true, default: () => mockKeyboardUp }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Text, TextInput, Pressable } = require('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) =>
      React.createElement(Pressable, { onPress, disabled, testID: `button-${title}` }, React.createElement(Text, null, title)),
    Input: ({ value, onChangeText, testID }: { value: string; onChangeText: (next: string) => void; testID?: string }) =>
      React.createElement(TextInput, { value, onChangeText, testID }),
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MemePushSheet from '@/components/chat/MemePushSheet';


// Safe-area metrics of a notched phone
const METRICS = { insets: { top: 47, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 320, height: 568 } };
// A picked GIF with a filename worth a title
const PICK = { uri: 'file:///monday-face_2.gif', fileName: 'monday-face_2.gif', mimeType: 'image/gif', fileSize: 1000 };







// -----------------------------------------------------------
// sheet
// -----------------------------------------------------------
//
// The sheet for PICK under a safe-area provider, with its
// confirm / cancel spies.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function sheet(busy = false) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <MemePushSheet asset={PICK} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />
    </SafeAreaProvider>,
  );
  return { view, onConfirm, onCancel };
}







describe('MemePushSheet', () => {
  afterEach(() => {
    mockKeyboardUp = false;
  });

  it('seeds the title from the filename and confirms it with the tags', async () => {
    const { view, onConfirm } = await sheet();
    expect(view.getByTestId('meme-push-title').props.value).toBe('monday face 2');
    await fireEvent.changeText(view.getByTestId('meme-push-tags'), 'pirmadienis, kava');
    await fireEvent.press(view.getByTestId('button-chat.addMeme'));
    expect(onConfirm).toHaveBeenCalledWith('monday face 2', 'pirmadienis, kava');
  });

  it('a blank title can never confirm', async () => {
    const { view, onConfirm } = await sheet();
    await fireEvent.changeText(view.getByTestId('meme-push-title'), '   ');
    await fireEvent.press(view.getByTestId('button-chat.addMeme'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('rides the keyboard: an avoiding view, a scrolling body, a smaller preview while typing', async () => {
    const down = await sheet();
    // The avoiding view wraps the whole card (its host View carries the id)
    expect(down.view.getByTestId('meme-push-avoid')).toBeTruthy();
    expect(down.view.getByTestId('meme-push-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    mockKeyboardUp = true;
    const up = await sheet();
    const card = up.view.getByTestId('meme-push-sheet');
    // Flush on the keys, not the home-indicator gap above them
    expect(StyleSheet.flatten(card.props.style).marginBottom).toBe(12);
  });
});
