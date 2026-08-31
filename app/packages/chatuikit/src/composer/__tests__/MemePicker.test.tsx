// -----------------------------------------------------------
//  [*] Tests — the meme library panel
//
//  The grid picks and pushes: a tile's tap hands the item up,
//  the "+" tile opens the host's push flow (a spinner while it
//  runs), search rides the host's round trip, the empty grid
//  invites — and the composer's meme badge toggles the panel
//  only while the field is empty.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));

import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Composer from '../Composer';
import MemePicker from '../MemePicker';
import { ChatUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';

const labels = defaultLabels.en;
const noop = () => {};
const ITEMS = [
  { id: 'g1', url: '/api/memes/file/a.gif', title: 'AČIŪ', width: 240, height: 240, preview: 'data:image/jpeg;base64,x' },
  { id: 'g2', url: '/api/memes/file/b.gif', title: 'LABAS', width: 240, height: 240 },
];
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>{ui}</ChatUiKitProvider></SafeAreaProvider>);

describe('MemePicker', () => {
  it('picks a tile, resolves its url, and offers the push tile first', async () => {
    const onPick = jest.fn();
    const onAdd = jest.fn();
    const { getByTestId } = await wrap(
      <MemePicker items={ITEMS} query="" onQueryChange={noop} onPick={onPick} onAdd={onAdd} />,
    );
    await fireEvent.press(getByTestId('chatuikit-meme-g1'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1', url: '/api/memes/file/a.gif' }));
    await fireEvent.press(getByTestId('chatuikit-meme-add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('search rides the host round trip; the empty grid invites', async () => {
    const onQueryChange = jest.fn();
    const empty = await wrap(<MemePicker items={[]} query="" onQueryChange={onQueryChange} onPick={noop} />);
    expect(empty.getByText(labels.emptyMemes)).toBeTruthy();
    await fireEvent.changeText(empty.getByTestId('chatuikit-meme-search'), 'kava');
    expect(onQueryChange).toHaveBeenCalledWith('kava');
  });
});

describe('Composer meme toggle', () => {
  const base = {
    onChangeText: noop, onSend: noop, onQuickLike: noop, onAttachMedia: noop, onAttachFile: noop,
    onToggleEmoji: noop, emojiOpen: false, uploadingMedia: false, replyTo: null, onCancelReply: noop,
  };

  it('toggles while the field is empty and steps aside once text arrives', async () => {
    const onToggleMemes = jest.fn();
    const empty = await wrap(<Composer {...base} value="" onToggleMemes={onToggleMemes} />);
    await fireEvent.press(empty.getByTestId('chatuikit-memes-toggle'));
    expect(onToggleMemes).toHaveBeenCalledTimes(1);
    const typed = await wrap(<Composer {...base} value="labas" onToggleMemes={onToggleMemes} />);
    expect(typed.queryByTestId('chatuikit-memes-toggle')).toBeNull();
  });
});
