// -----------------------------------------------------------
//  [*] Tests — chatkit useScreenReaderEnabledRef
//
//  The kit only speaks when a reader listens: the ref starts
//  false, adopts the async initial answer, follows the change
//  event, and a late initial answer after unmount must not
//  write.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useScreenReaderEnabledRef } from '@/chatkit/a11y';


type ChangeListener = (enabled: boolean) => void;

let resolveInitial: (enabled: boolean) => void = () => {};
let changeListener: ChangeListener | null = null;
const removeSpy = jest.fn();

beforeEach(() => {
  changeListener = null;
  removeSpy.mockClear();
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInitial = resolve;
        }),
    );
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    cb: ChangeListener,
  ) => {
    if (event === 'screenReaderChanged') changeListener = cb;
    return { remove: removeSpy } as never;
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});


describe('useScreenReaderEnabledRef', () => {
  it('starts false and adopts the initial async answer', async () => {
    const { result } = await renderHook(() => useScreenReaderEnabledRef());
    expect(result.current.current).toBe(false);

    await act(async () => {
      resolveInitial(true);
    });
    expect(result.current.current).toBe(true);
  });

  it('follows the screenReaderChanged event without re-rendering', async () => {
    const { result } = await renderHook(() => useScreenReaderEnabledRef());
    await act(async () => {
      resolveInitial(false);
    });

    await act(async () => {
      changeListener?.(true);
    });
    expect(result.current.current).toBe(true);

    await act(async () => {
      changeListener?.(false);
    });
    expect(result.current.current).toBe(false);
  });

  it('ignores a late initial answer after unmount and detaches the listener', async () => {
    const { result, unmount } = await renderHook(() => useScreenReaderEnabledRef());
    const ref = result.current;
    await act(async () => {
      unmount();
    });
    expect(removeSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial(true);
    });
    expect(ref.current).toBe(false);
  });
});
