// -----------------------------------------------------------
//  [*] Tests — AssistantThread: empty state, chips, the list,
//      the keyboard column
//
//  An empty thread shows the host's title and body and one
//  chip per suggestion, in order, each carrying its testID;
//  tapping a chip sends its PROMPT (not its title) as the
//  user's turn and the welcome leaves the tree. The list wears
//  the stable root testID and keeps content in place while the
//  tail grows; the host's bottom inset pads the COLUMN under
//  the composer, not the list. The "latest" button arms the
//  moment an upward move leaves the follow line, stays until
//  the reader is back at the tail, scrolls to the end on a
//  press and carries the host's screen-reader label. The
//  keyboard column pads by the keyboard: on iOS through the
//  platform's avoiding view, on Android by the kit's own pad —
//  only when the edge-to-edge window kept its height — with
//  the drag-dismiss mode the platform honours.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, FlatList, Keyboard, Platform } from 'react-native';
import type { TestInstance } from 'test-renderer';

import AssistantThread from '../AssistantThread';
import type { AssistantSuggestion } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const SUGGESTIONS: AssistantSuggestion[] = [
  { title: 'Rytojaus paskaitos', prompt: 'Kokios paskaitos rytoj?', description: 'Pagal jūsų grupę' },
  { title: 'Naujienos', prompt: 'Kas naujo fakultete?' },
];

const renderThread = (model: ReturnType<typeof createScriptedModel>, extra: Partial<React.ComponentProps<typeof AssistantThread>> = {}) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} {...extra} />
    </ScriptedThread>,
  );

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

// The renderer exposes HOST nodes only: the list's props are read
// off the scroll view it renders
const hostList = (view: Awaited<ReturnType<typeof render>>): TestInstance => {
  const hit = view.root?.queryAll((node) => node.type === 'RCTScrollView')[0];
  if (!hit) throw new Error('no scroll view in the tree');
  return hit;
};

// A scroll echo: how far the reader sits above the tail
const scrollEcho = (distanceFromBottom: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: 1000 - 400 - distanceFromBottom },
    contentSize: { width: 300, height: 1000 },
    layoutMeasurement: { width: 300, height: 400 },
  },
});

describe('empty state', () => {
  it('shows the host title, body and one chip per suggestion in order', async () => {
    const view = await renderThread(createScriptedModel([]), { suggestions: SUGGESTIONS });
    expect(view.getByTestId('assistantuikit-thread')).toBeTruthy();
    expect(view.getByText('Sveiki!')).toBeTruthy();
    expect(view.getByText('Paklauskite apie tvarkaraštį, naujienas ar studijas.')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-0')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-1')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-suggestion-2')).toBeNull();
    expect(view.getByText('Rytojaus paskaitos')).toBeTruthy();
    expect(view.getByText('Pagal jūsų grupę')).toBeTruthy();
    expect(view.getByText('Naujienos')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-message-user')).toBeNull();
    expect(view.queryByTestId('assistantuikit-message-assistant')).toBeNull();
  });

  it('renders no chips without suggestions', async () => {
    const view = await renderThread(createScriptedModel([]));
    expect(view.getByText('Sveiki!')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-suggestion-0')).toBeNull();
  });

  it('a chip sends its PROMPT as the user turn and the welcome leaves', async () => {
    const model = createScriptedModel([[{ text: 'Rytoj: Matematika 9:00' }]]);
    const view = await renderThread(model, { suggestions: SUGGESTIONS });
    await fireEvent.press(view.getByTestId('assistantuikit-suggestion-0'));
    await settled(view);
    expect(model.calls).toHaveLength(1);
    const userTurn = model.calls[0].messages[0];
    expect(userTurn.role).toBe('user');
    expect(userTurn.content).toEqual([{ type: 'text', text: 'Kokios paskaitos rytoj?' }]);
    expect(view.getByText('Kokios paskaitos rytoj?')).toBeTruthy();
    expect(view.getByText('Rytoj: Matematika 9:00')).toBeTruthy();
    expect(view.queryByText('Sveiki!')).toBeNull();
    expect(view.queryByTestId('assistantuikit-suggestion-0')).toBeNull();
  });
});

describe('the list', () => {
  it('keeps visible content in place; the host inset pads the column, the list keeps its own 8', async () => {
    const view = await renderThread(createScriptedModel([]), { contentPaddingBottom: 72 });
    const list = hostList(view);
    expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
    // The inset sits under the composer — inside the list it
    // could never move a covered Send button
    expect(flat(list.props.contentContainerStyle).paddingBottom).toBe(8);
    expect(flat(view.getByTestId('assistantuikit-thread').props.style).paddingBottom).toBe(72);
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(list.props.keyboardDismissMode).toBe('interactive');
  });

  it('offers the "latest" button while scrolled away — labelled — and scrolls to the end on press', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
    const view = await renderThread(createScriptedModel([]));
    const list = hostList(view);
    expect(view.queryByTestId('assistantuikit-scroll-latest')).toBeNull();

    await act(async () => {
      fireEvent.scroll(list, scrollEcho(300));
    });
    const button = view.getByTestId('assistantuikit-scroll-latest');
    expect(button.props.accessibilityLabel).toBe('Naujausia žinutė');

    scrollToEnd.mockClear();
    await fireEvent.press(button);
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });

    // Only back AT the tail does the button leave
    await act(async () => {
      fireEvent.scroll(list, scrollEcho(2));
    });
    expect(view.queryByTestId('assistantuikit-scroll-latest')).toBeNull();
    scrollToEnd.mockRestore();
  });

  it('an upward nudge past the follow line shows the button at once, and it stays until the tail', async () => {
    const view = await renderThread(createScriptedModel([]));
    const list = hostList(view);

    // Pinned to the tail: nothing
    await act(async () => {
      fireEvent.scroll(list, scrollEcho(0));
    });
    expect(view.queryByTestId('assistantuikit-scroll-latest')).toBeNull();

    // A 10pt upward move: past the 4pt follow line the upstream
    // stops following, so the way back appears immediately —
    // no 80pt dead zone
    await act(async () => {
      fireEvent.scroll(list, scrollEcho(10));
    });
    expect(view.getByTestId('assistantuikit-scroll-latest')).toBeTruthy();

    // Drifting DOWN to 6pt is still off the tail: hysteresis
    // keeps the button
    await act(async () => {
      fireEvent.scroll(list, scrollEcho(6));
    });
    expect(view.getByTestId('assistantuikit-scroll-latest')).toBeTruthy();

    // At the tail it leaves
    await act(async () => {
      fireEvent.scroll(list, scrollEcho(3));
    });
    expect(view.queryByTestId('assistantuikit-scroll-latest')).toBeNull();
  });
});

// The keyboard listeners under test, kept per event name; every
// subscriber is invoked so the platform's own views stay live
const captureKeyboard = () => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, callback: (event: unknown) => void) => {
    (listeners[event] ??= []).push(callback);
    return { remove: jest.fn() } as never;
  }) as never);
  const emit = (event: string, payload: unknown) => (listeners[event] ?? []).forEach((callback) => callback(payload));
  return { emit };
};

describe('the keyboard column on iOS', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pads the column by the keyboard overlap through the avoiding view', async () => {
    const keyboard = captureKeyboard();
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    const view = await renderThread(createScriptedModel([]));
    const column = view.getByTestId('assistantuikit-keyboard-column');

    // The avoiding view needs its own frame before it can
    // measure the overlap
    await act(async () => {
      fireEvent(column, 'layout', { persist: () => {}, nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } } });
    });
    await act(async () => {
      keyboard.emit('keyboardWillShow', {
        duration: 0,
        easing: undefined,
        endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 300 },
      });
    });
    expect(flat(view.getByTestId('assistantuikit-keyboard-column').props.style).paddingBottom).toBe(300);

    await act(async () => {
      keyboard.emit('keyboardWillHide', undefined);
    });
    expect(flat(view.getByTestId('assistantuikit-keyboard-column').props.style).paddingBottom).toBe(0);
  });
});

describe('the keyboard column on Android', () => {
  const originalOS = Platform.OS;
  beforeAll(() => Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true }));
  afterAll(() => Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true }));
  afterEach(() => jest.restoreAllMocks());

  it('dismisses the keyboard on drag — the interactive mode the platform lacks', async () => {
    const view = await renderThread(createScriptedModel([]));
    expect(hostList(view).props.keyboardDismissMode).toBe('on-drag');
  });

  it('pads by the keyboard height only while the edge-to-edge window kept its height', async () => {
    const keyboard = captureKeyboard();
    const dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 800, scale: 2, fontScale: 1 });
    const view = await renderThread(createScriptedModel([]));
    const columnPad = () => flat(view.getByTestId('assistantuikit-keyboard-column').props.style).paddingBottom;

    // Edge-to-edge: the window kept its 800 while a 300 keyboard
    // appeared — the kit pads what the platform no longer does
    await act(async () => {
      keyboard.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 300 } });
    });
    expect(columnPad()).toBe(300);

    await act(async () => {
      keyboard.emit('keyboardDidHide', undefined);
    });
    expect(columnPad()).toBe(0);

    // adjustResize: the window shrank by the keyboard — the
    // platform lifted already, the kit stays out of the way
    dims.mockReturnValue({ width: 390, height: 500, scale: 2, fontScale: 1 });
    await act(async () => {
      keyboard.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 300 } });
    });
    expect(columnPad()).toBe(0);
  });
});
