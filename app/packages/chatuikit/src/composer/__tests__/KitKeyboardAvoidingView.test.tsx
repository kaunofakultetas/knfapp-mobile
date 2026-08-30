// -----------------------------------------------------------
//  [*] Tests — chatuikit KitKeyboardAvoidingView (Android)
//
//  Edge-to-edge: a keyboard that appears while the window keeps
//  its height gets a padding of its own height; adjustResize (the
//  window shrank) gets none; hiding clears it.
// -----------------------------------------------------------

import { act, render } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, Text } from 'react-native';

import KitKeyboardAvoidingView from '../KitKeyboardAvoidingView';


describe('KitKeyboardAvoidingView on Android', () => {
  const original = Platform.OS;
  beforeAll(() => Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true }));
  afterAll(() => Object.defineProperty(Platform, 'OS', { value: original, configurable: true }));

  it('pads by the keyboard height under edge-to-edge and not under adjustResize', async () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: unknown) => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() } as never;
    }) as never);
    const dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 800, scale: 2, fontScale: 1 });
    const { getByTestId } = await render(
      <KitKeyboardAvoidingView testID="kav" keyboardVerticalOffset={20}>
        <Text>x</Text>
      </KitKeyboardAvoidingView>,
    );
    // The window did not resize: edge-to-edge → pad (minus the offset)
    await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 300 } }));
    expect(getByTestId('kav').props.style).toEqual(expect.arrayContaining([{ paddingBottom: 280 }]));
    await act(async () => listeners.keyboardDidHide({}));
    expect(getByTestId('kav').props.style).not.toEqual(expect.arrayContaining([{ paddingBottom: 280 }]));
    // The window shrank by the keyboard: adjustResize → no pad
    dims.mockReturnValue({ width: 390, height: 500, scale: 2, fontScale: 1 });
    await act(async () => listeners.keyboardDidShow({ endCoordinates: { height: 300 } }));
    expect(getByTestId('kav').props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: expect.any(Number) })]));
    addListener.mockRestore();
    dims.mockRestore();
  });
});
