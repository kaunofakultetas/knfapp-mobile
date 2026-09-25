// -----------------------------------------------------------
//  [*] Tests — chatuikit KitKeyboardAvoidingView (Android)
//
//  Edge-to-edge: a keyboard that appears while the window keeps
//  its height gets a padding of its own height; adjustResize (the
//  window shrank) gets none; hiding clears it. The keyboard-less
//  baseline moves only while the keyboard is DOWN (KNF-165): a
//  resize that arrives with the keyboard up re-judges the pad
//  instead of becoming the baseline, and a split-screen resize
//  with the keyboard down still moves it.
// -----------------------------------------------------------

import { act, render } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, Text } from 'react-native';

import KitKeyboardAvoidingView from '../KitKeyboardAvoidingView';


describe('KitKeyboardAvoidingView on Android', () => {
  const original = Platform.OS;
  beforeAll(() => Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true }));
  afterAll(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }));

  // The Keyboard and Dimensions emitters, driven by hand
  const setup = async (startHeight = 800) => {
    const listeners: Record<string, (e: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: unknown) => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() } as never;
    }) as never);
    const window = { height: startHeight };
    jest.spyOn(Dimensions, 'get').mockImplementation((() => ({ width: 390, height: window.height, scale: 2, fontScale: 1 })) as never);
    jest.spyOn(Dimensions, 'addEventListener').mockImplementation(((event: string, cb: (e: unknown) => void) => {
      listeners[`dims:${event}`] = cb;
      return { remove: jest.fn() } as never;
    }) as never);
    const view = await render(
      <KitKeyboardAvoidingView testID="kav">
        <Text>x</Text>
      </KitKeyboardAvoidingView>,
    );
    const pad = () => {
      const style = view.getByTestId('kav').props.style as unknown[];
      const padded = style.find((s) => s && typeof s === 'object' && 'paddingBottom' in (s as object)) as { paddingBottom: number } | undefined;
      return padded?.paddingBottom ?? 0;
    };
    const resize = async (height: number) => {
      window.height = height;
      await act(async () => listeners['dims:change']({ window: { width: 390, height, scale: 2, fontScale: 1 } }));
    };
    const show = async (keyboard: number) => act(async () => listeners.keyboardDidShow({ endCoordinates: { height: keyboard } }));
    const hide = async () => act(async () => listeners.keyboardDidHide({}));
    return { pad, resize, show, hide, window };
  };

  afterEach(() => jest.restoreAllMocks());

  it('pads by the keyboard height under edge-to-edge and not under adjustResize', async () => {
    const h = await setup();
    await h.show(300);
    expect(h.pad()).toBe(300);
    await h.hide();
    expect(h.pad()).toBe(0);
    // The window shrank by the keyboard before the show: adjustResize
    h.window.height = 500;
    await h.show(300);
    expect(h.pad()).toBe(0);
  });

  it('a resize reported AFTER the show re-judges the pad instead of double-lifting', async () => {
    const h = await setup();
    await h.show(300);
    expect(h.pad()).toBe(300);
    // adjustResize catching up: the window shrinks with the keyboard up
    await h.resize(500);
    expect(h.pad()).toBe(0);
  });

  it('a resize while the keyboard is up never becomes the keyboard-less baseline', async () => {
    const h = await setup();
    await h.show(300);
    await h.resize(500);
    await h.hide();
    // Back to full height; the next (edge-to-edge) keyboard must pad
    h.window.height = 800;
    await h.show(300);
    expect(h.pad()).toBe(300);
  });

  it('a split-screen resize with the keyboard DOWN moves the baseline', async () => {
    const h = await setup();
    await h.resize(600);
    // Edge-to-edge in the smaller window: the window keeps 600
    await h.show(250);
    expect(h.pad()).toBe(250);
  });
});
