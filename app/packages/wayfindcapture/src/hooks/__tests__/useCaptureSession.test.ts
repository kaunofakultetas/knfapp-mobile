// -----------------------------------------------------------
//  [*] Tests — wayfindcapture useCaptureSession
//
//  The hook as a pure subscription: a null session shows the
//  inert empty snapshot, every session move (begin, feed,
//  accept, retake) re-renders with the fresh one, the snapshot
//  identity is stable between moves, and swapping the session
//  object re-reads from the new store. renderHook and rerender
//  are awaited — this RNTL renders through the async act.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';

import type { CaptureTarget } from '../../core/plan';
import { createCaptureSession, type CaptureSession } from '../../core/session';
import { useCaptureSession } from '../useCaptureSession';


const targets: CaptureTarget[] = [
  { id: 'r0-0', yawDeg: 0, pitchDeg: 0 },
  { id: 'r0-1', yawDeg: 120, pitchDeg: 0 },
];

const QUIET = { x: 0, y: 0, z: 0 };

const makeSession = () => {
  let t = 0;
  const session = createCaptureSession({ targets, now: () => t });
  return { session, tick: (ms: number) => (t += ms) };
};


describe('useCaptureSession', () => {
  it('answers the inert empty snapshot for a null session', async () => {
    const h = await renderHook(() => useCaptureSession(null));
    expect(h.result.current).toMatchObject({ phase: 'idle', currentId: null, aim: null, shotsDone: 0, shotsTotal: 0 });
    expect(h.result.current.targets).toEqual([]);
  });

  it('re-renders on begin, feed and accept with the live snapshot', async () => {
    const { session, tick } = makeSession();
    const h = await renderHook(() => useCaptureSession(session));
    expect(h.result.current.phase).toBe('idle');
    expect(h.result.current.shotsTotal).toBe(2);

    await act(async () => session.begin());
    expect(h.result.current.phase).toBe('capturing');

    await act(async () => {
      session.feed({ yawDeg: 3, pitchDeg: 0, rollDeg: 0 }, QUIET);
      tick(300);
      session.feed({ yawDeg: 3, pitchDeg: 0, rollDeg: 0 }, QUIET);
    });
    expect(h.result.current.currentId).toBe('r0-0');
    expect(h.result.current.aim?.aligned).toBe(true);
    expect(h.result.current.aim?.stable).toBe(true);

    await act(async () => session.accept('r0-0', { yawDeg: 3, pitchDeg: 0, rollDeg: 0 }));
    expect(h.result.current.shotsDone).toBe(1);
    expect(h.result.current.targets.find((target) => target.id === 'r0-0')?.done).toBe(true);
  });

  it('keeps the snapshot identity between moves and changes it after one', async () => {
    const { session } = makeSession();
    const h = await renderHook(() => useCaptureSession(session));

    const before = h.result.current;
    await h.rerender(undefined);
    expect(h.result.current).toBe(before);

    await act(async () => session.begin());
    expect(h.result.current).not.toBe(before);
  });

  it('a retake reopens a finished capture in the rendered state', async () => {
    const { session } = makeSession();
    const h = await renderHook(() => useCaptureSession(session));

    await act(async () => {
      session.begin();
      for (const target of targets) session.accept(target.id, { yawDeg: target.yawDeg, pitchDeg: 0, rollDeg: 0 });
    });
    expect(h.result.current.phase).toBe('done');

    await act(async () => session.retake('r0-1'));
    expect(h.result.current.phase).toBe('capturing');
    expect(h.result.current.shotsDone).toBe(1);
  });

  it('swapping the session re-reads from the new store', async () => {
    const first = makeSession().session;
    const second = makeSession().session;
    second.begin();

    const h = await renderHook(({ session }: { session: CaptureSession }) => useCaptureSession(session), {
      initialProps: { session: first },
    });
    expect(h.result.current.phase).toBe('idle');

    await h.rerender({ session: second });
    expect(h.result.current.phase).toBe('capturing');
  });
});
