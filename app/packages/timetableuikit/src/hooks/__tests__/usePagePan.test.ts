// -----------------------------------------------------------
//  [*] Tests — usePagePan: claim, commit, latch, and the guards
//
//  The handlers are exercised directly, the way the responder
//  system calls them — including the boundaries the grid tests
//  never reach: the exact claim distance, the exact commit
//  distance, a second finger, and enabled flipping mid-drag.
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import type { GestureResponderEvent } from 'react-native';

import { usePagePan, type PagePanOptions } from '../usePagePan';

const touch = (pageX: number, pageY: number, fingers = 1) =>
  ({ nativeEvent: { pageX, pageY, touches: Array.from({ length: fingers }, () => ({})) } }) as unknown as GestureResponderEvent;

async function setup(options: PagePanOptions = {}) {
  const onPage = jest.fn();
  const hook = await renderHook((props: PagePanOptions) => usePagePan(onPage, props), { initialProps: options });
  return { onPage, hook };
}

describe('usePagePan claim', () => {
  it('needs MORE than claimDx of decisively horizontal travel', async () => {
    const { hook } = await setup();
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    expect(h.onMoveShouldSetResponderCapture(touch(190, 301))).toBe(false); // dx 10 — under
    expect(h.onMoveShouldSetResponderCapture(touch(188, 300))).toBe(false); // dx 12 — exactly the threshold
    expect(h.onMoveShouldSetResponderCapture(touch(187, 302))).toBe(true);  // dx 13 — over
    expect(h.onMoveShouldSetResponderCapture(touch(180, 325))).toBe(false); // |dy| beats |dx|
  });

  it('honors a custom claimDx', async () => {
    const { hook } = await setup({ claimDx: 30 });
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    expect(h.onMoveShouldSetResponderCapture(touch(175, 300))).toBe(false); // dx 25
    expect(h.onMoveShouldSetResponderCapture(touch(165, 300))).toBe(true);  // dx 35
  });

  it('enabled: false never claims and never records a start', async () => {
    const { hook, onPage } = await setup({ enabled: false });
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    expect(h.onMoveShouldSetResponderCapture(touch(100, 300))).toBe(false);
    h.onResponderMove(touch(80, 300));
    h.onResponderRelease(touch(80, 300));
    expect(onPage).not.toHaveBeenCalled();
  });
});

describe('usePagePan commit', () => {
  it('commits at EXACTLY commitDx, not a pixel earlier, and latches to one page', async () => {
    const { hook, onPage } = await setup();
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    h.onResponderMove(touch(151, 300)); // dx 49
    expect(onPage).not.toHaveBeenCalled();
    h.onResponderMove(touch(150, 300)); // dx 50
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onPage).toHaveBeenCalledWith(1);
    h.onResponderMove(touch(60, 300));  // keeps dragging — latched
    h.onResponderRelease(touch(60, 300));
    expect(onPage).toHaveBeenCalledTimes(1);
    // The latch clears with the finger: the next gesture pages again
    h.onStartShouldSetResponderCapture(touch(100, 300));
    h.onResponderRelease(touch(170, 300)); // dx +70 → back
    expect(onPage).toHaveBeenCalledTimes(2);
    expect(onPage).toHaveBeenLastCalledWith(-1);
  });

  it('honors a custom commitDx', async () => {
    const { hook, onPage } = await setup({ commitDx: 100 });
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    h.onResponderMove(touch(101, 300)); // dx 99
    expect(onPage).not.toHaveBeenCalled();
    h.onResponderMove(touch(100, 300)); // dx 100
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it('flipping enabled off MID-GESTURE cancels the commit — even through handlers captured before the flip', async () => {
    const { hook, onPage } = await setup({ enabled: true });
    const before = hook.result.current;
    before.onStartShouldSetResponderCapture(touch(200, 300));
    before.onResponderMove(touch(170, 300)); // dx 30 — under, still armed
    await hook.rerender({ enabled: false });
    before.onResponderMove(touch(100, 300)); // dx 100 — would commit
    before.onResponderRelease(touch(100, 300));
    expect(onPage).not.toHaveBeenCalled();
  });
});

describe('usePagePan multi-touch', () => {
  it('a second finger abandons the gesture — no claim, no commit from mixed coordinates', async () => {
    const { hook, onPage } = await setup();
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    h.onStartShouldSetResponderCapture(touch(600, 300, 2)); // second finger lands
    expect(h.onMoveShouldSetResponderCapture(touch(100, 300))).toBe(false);
    h.onResponderMove(touch(100, 300));
    h.onResponderRelease(touch(100, 300));
    expect(onPage).not.toHaveBeenCalled();
    // Every finger lifted: a fresh single-touch gesture pages
    h.onStartShouldSetResponderCapture(touch(200, 300));
    h.onResponderMove(touch(140, 300));
    h.onResponderRelease(touch(140, 300));
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it('a second finger during a claimed drag stops further movement from committing', async () => {
    const { hook, onPage } = await setup();
    const h = hook.result.current;
    h.onStartShouldSetResponderCapture(touch(200, 300));
    h.onResponderMove(touch(180, 300, 2)); // pinch begins before the threshold
    h.onResponderMove(touch(80, 300));     // one finger keeps sliding far
    h.onResponderRelease(touch(80, 300));
    expect(onPage).not.toHaveBeenCalled();
  });
});
