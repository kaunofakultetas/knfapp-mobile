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


// The kit's own English wording
const labels = defaultLabels.en;
// Two library memes: an animated one with its blur, a plain one
const ITEMS = [
  { id: 'g1', url: '/api/memes/file/a.gif', title: 'AČIŪ', width: 240, height: 240, preview: 'data:image/jpeg;base64,x' },
  { id: 'g2', url: '/api/memes/file/b.gif', title: 'LABAS', width: 240, height: 240 },
];
// Safe-area metrics of a notched 390pt phone
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };







// -----------------------------------------------------------
// noop
// -----------------------------------------------------------
//
// The inert handler every required callback gets.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function noop() {}







// -----------------------------------------------------------
// wrap
// -----------------------------------------------------------
//
// Renders under the safe-area and kit providers, English, with
// a resolver that makes library paths absolute.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function wrap(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>{ui}</ChatUiKitProvider></SafeAreaProvider>);
}

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

  it('toggles from the attachment tray, draft or not, and says whether the panel is open', async () => {
    const onToggleMemes = jest.fn();
    for (const value of ['', 'labas']) {
      const view = await wrap(<Composer {...base} value={value} onToggleMemes={onToggleMemes} memesOpen={false} />);
      await fireEvent.press(view.getByTestId('chatuikit-attach-toggle'));
      expect(view.getByTestId('chatuikit-memes-toggle').props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
      await fireEvent.press(view.getByTestId('chatuikit-memes-toggle'));
    }
    expect(onToggleMemes).toHaveBeenCalledTimes(2);
  });
});


// The grid never lies about why it is empty, and an own meme
// can be taken back (KNF-192)
describe('MemePicker states and own removal', () => {
  it('a failed load says so with a retry — never "no memes yet"', async () => {
    const onRetry = jest.fn();
    const view = await wrap(<MemePicker items={[]} query="" onQueryChange={noop} onPick={noop} error onRetry={onRetry} />);
    expect(view.getByText(labels.memesLoadError)).toBeTruthy();
    expect(view.queryByText(labels.emptyMemes)).toBeNull();
    await fireEvent.press(view.getByTestId('chatuikit-meme-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a search that matched nothing says that, an empty library invites a push', async () => {
    const searched = await wrap(<MemePicker items={[]} query="kava" onQueryChange={noop} onPick={noop} />);
    expect(searched.getByText(labels.noMemeResults)).toBeTruthy();
    const empty = await wrap(<MemePicker items={[]} query="" onQueryChange={noop} onPick={noop} />);
    expect(empty.getByText(labels.emptyMemes)).toBeTruthy();
  });

  it('only an own tile offers its removal — long-press and accessibility action alike', async () => {
    const onRemove = jest.fn();
    const items = [{ ...ITEMS[0], own: true }, ITEMS[1]];
    const view = await wrap(<MemePicker items={items} query="" onQueryChange={noop} onPick={noop} onRemove={onRemove} />);
    await fireEvent(view.getByTestId('chatuikit-meme-g1'), 'longPress');
    await fireEvent(view.getByTestId('chatuikit-meme-g1'), 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(onRemove.mock.calls[0][0].id).toBe('g1');
    expect(view.getByTestId('chatuikit-meme-g2').props.accessibilityActions).toBeUndefined();
    await fireEvent(view.getByTestId('chatuikit-meme-g2'), 'longPress');
    expect(onRemove).toHaveBeenCalledTimes(2);
  });
});
