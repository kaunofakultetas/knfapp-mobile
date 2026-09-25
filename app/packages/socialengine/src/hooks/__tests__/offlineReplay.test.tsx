// -----------------------------------------------------------
//  [*] Tests — the offline task queue, end to end
//
//  A like tapped while the transport is down KEEPS its
//  optimistic shadow and waits in the queue; the host's
//  restore signal drains it with the viewer's FINAL intent,
//  once per target. A healable replay failure keeps the rest
//  waiting, a definitive one (a 429 included) drops that task
//  with one notice and the walk goes on, a persisted queue
//  replays on the next signed-in mount, and an account switch
//  throws the departing viewer's intents away. The replay and
//  the live taps are ONE writer per target (KNF-121): a tap
//  during a replay queues behind it, a parked intent whose
//  target has a live call running is dropped unsent, and an
//  entry the live lane purged after the drain listed it is
//  never replayed.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactNode } from 'react';

import { memorySocialStorage } from '../../core/storage';
import type { LikeResult, LikeTarget, SocialNotice, SocialTransport } from '../../core/transport';
import { SocialEngineProvider } from '../../provider';
import { useLikeToggle } from '../useLikeToggle';


// The signed-in viewer the engine runs as
const VIEWER = { id: 'u1', displayName: 'Aš' };
// The post every single-target case toggles: not liked, 4 likes
const POST = { id: 'p1', likedByMe: false, likeCount: 4 };







// -----------------------------------------------------------
// OFFLINE
// -----------------------------------------------------------
//
// The healable failure: a status-0 network error, the shape
// the KNF client throws when the phone has no connection.
//
// Used by:
//   - scriptedTransport (below) — the 'offline' step
// -----------------------------------------------------------

const OFFLINE = () => Object.assign(new Error('offline'), { status: 0 });


// setLiked scripted per call: 'offline' rejects retryable,
// 'refuse' rejects definitively, 'limited' is the backend's
// 429 (definitive too), a LikeResult resolves
type Script = 'offline' | 'refuse' | 'limited' | LikeResult;







// -----------------------------------------------------------
// scriptedTransport
// -----------------------------------------------------------
//
// A transport whose setLiked answers from the script, one
// step per call, recording every call it was asked.
//
// Used by:
//   - mount (below)
//   - the tests below that build their own provider
// -----------------------------------------------------------

function scriptedTransport(script: Script[]) {
  const calls: { target: LikeTarget; liked: boolean }[] = [];
  const transport: SocialTransport = {
    async setLiked(target, liked) {
      calls.push({ target, liked });
      const step = script.shift();
      if (step === 'offline') throw OFFLINE();
      if (step === 'refuse') throw Object.assign(new Error('refused'), { status: 422 });
      if (step === 'limited') throw Object.assign(new Error('slow down'), { status: 429, serverCode: 'rate_limited' });
      if (step) return step;
      throw new Error('script exhausted');
    },
    fetchPoll: async () => null,
    vote: async () => {
      throw new Error('not under test');
    },
  };
  return { transport, calls };
}







// -----------------------------------------------------------
// restoreBus
// -----------------------------------------------------------
//
// The host's network-restore signal, fired by hand.
//
// Used by:
//   - mount, mountManual (below)
//   - the tests below that build their own provider
// -----------------------------------------------------------

function restoreBus() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fire: () => listeners.forEach((fn) => fn()),
  };
}







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Drains the microtask chains a replay settles through.
//
// Used by:
//   - mount, mountManual (below)
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });







// -----------------------------------------------------------
// mount
// -----------------------------------------------------------
//
// useLikeToggle(POST) under a provider wired to a scripted
// transport, a hand-fired restore bus and an inspectable
// storage; notices are collected.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function mount(script: Script[], options: { storage?: ReturnType<typeof memorySocialStorage> } = {}) {
  const t = scriptedTransport(script);
  const bus = restoreBus();
  const storage = options.storage ?? memorySocialStorage();
  const notices: SocialNotice[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SocialEngineProvider transport={t.transport} currentUser={VIEWER} notify={(n) => notices.push(n)} storage={storage} onNetworkRestore={bus.subscribe}>
      {children}
    </SocialEngineProvider>
  );
  const hook = await renderHook(() => useLikeToggle(POST), { wrapper });
  await flush();
  return { ...t, bus, storage, notices, hook };
}


describe('offline replay', () => {
  it('an offline like keeps its optimistic view, queues the intent and says nothing', async () => {
    const m = await mount(['offline']);
    await act(async () => m.hook.result.current.toggle());
    await flush();

    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([]);
    expect(JSON.parse(m.storage.dump()['social:tasks'])).toHaveLength(1);
  });

  it('the restore signal drains the FINAL intent once and the server word settles the shadow', async () => {
    const m = await mount(['offline', { liked: true, likeCount: 5 }]);
    await act(async () => m.hook.result.current.toggle());
    await flush();
    expect(m.calls).toHaveLength(1);

    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].liked).toBe(true);
    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.storage.dump()['social:tasks']).toBe('[]');
  });

  it('toggling while offline coalesces to ONE queued task carrying the last word', async () => {
    const m = await mount(['offline', 'offline', 'offline', 'offline', { liked: false, likeCount: 4 }]);
    await act(async () => m.hook.result.current.toggle());
    await flush();
    await act(async () => m.hook.result.current.toggle());
    await flush();
    await act(async () => m.hook.result.current.toggle());
    await flush();

    const queued = JSON.parse(m.storage.dump()['social:tasks']) as { desired: boolean }[];
    expect(queued).toHaveLength(1);
    expect(m.hook.result.current.liked).toBe(true);

    // One more flip lands on "unliked" before the network returns
    await act(async () => m.hook.result.current.toggle());
    await flush();
    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls[m.calls.length - 1].liked).toBe(false);
    expect(m.hook.result.current.liked).toBe(false);
  });

  it('a LIVE success purges the stale queued intent — the replay must never fire an outdated flip', async () => {
    const m = await mount(['offline', { liked: false, likeCount: 4 }]);
    await act(async () => m.hook.result.current.toggle());
    await flush();
    expect(JSON.parse(m.storage.dump()['social:tasks'])).toHaveLength(1);

    // The network returned between taps: this toggle lands live
    await act(async () => m.hook.result.current.toggle());
    await flush();
    expect(m.storage.dump()['social:tasks']).toBe('[]');

    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.hook.result.current.liked).toBe(false);
  });

  it('a still-offline replay keeps the queue for the next signal', async () => {
    const m = await mount(['offline', 'offline', { liked: true, likeCount: 5 }]);
    await act(async () => m.hook.result.current.toggle());
    await flush();

    await act(async () => m.bus.fire());
    await flush();
    expect(JSON.parse(m.storage.dump()['social:tasks'])).toHaveLength(1);

    await act(async () => m.bus.fire());
    await flush();
    expect(m.storage.dump()['social:tasks']).toBe('[]');
    expect(m.hook.result.current.liked).toBe(true);
  });

  it('a definitive replay refusal drops the task, reverts the shadow and notifies once', async () => {
    const m = await mount(['offline', 'refuse']);
    await act(async () => m.hook.result.current.toggle());
    await flush();

    await act(async () => m.bus.fire());
    await flush();
    expect(m.storage.dump()['social:tasks']).toBe('[]');
    expect(m.hook.result.current.liked).toBe(false);
    expect(m.hook.result.current.likeCount).toBe(4);
    expect(m.notices).toEqual([{ level: 'error', code: 'like_failed' }]);
  });

  it('a poisoned task — a 429 on replay — is dropped and the walk goes on to the next one', async () => {
    // Two posts liked offline; on restore the first replay is
    // rate-limited. That task alone dies (revert + one notice);
    // the second still replays and settles — it must never be
    // held hostage by the first, and nothing may replay forever
    const POST2 = { id: 'p2', likedByMe: false, likeCount: 1 };
    const t = scriptedTransport(['offline', 'offline', 'limited', { liked: true, likeCount: 2 }]);
    const bus = restoreBus();
    const storage = memorySocialStorage();
    const notices: SocialNotice[] = [];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SocialEngineProvider transport={t.transport} currentUser={VIEWER} notify={(n) => notices.push(n)} storage={storage} onNetworkRestore={bus.subscribe}>
        {children}
      </SocialEngineProvider>
    );
    const hook = await renderHook(() => ({ first: useLikeToggle(POST), second: useLikeToggle(POST2) }), { wrapper });
    await flush();

    await act(async () => hook.result.current.first.toggle());
    await flush();
    await act(async () => hook.result.current.second.toggle());
    await flush();
    expect(JSON.parse(storage.dump()['social:tasks'])).toHaveLength(2);

    await act(async () => bus.fire());
    await flush();

    expect(t.calls).toHaveLength(4);
    expect(t.calls[3]).toEqual({ target: { type: 'post', id: 'p2' }, liked: true });
    expect(hook.result.current.first.liked).toBe(false);
    expect(hook.result.current.first.likeCount).toBe(4);
    expect(hook.result.current.second.liked).toBe(true);
    expect(hook.result.current.second.likeCount).toBe(2);
    expect(storage.dump()['social:tasks']).toBe('[]');
    expect(notices).toEqual([{ level: 'error', code: 'like_failed' }]);
  });

  it('a persisted queue replays as soon as the next signed-in provider mounts', async () => {
    const storage = memorySocialStorage();
    const first = await mount(['offline'], { storage });
    await act(async () => first.hook.result.current.toggle());
    await flush();
    await first.hook.unmount();

    const second = await mount([{ liked: true, likeCount: 5 }], { storage });
    await flush();
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0].liked).toBe(true);
    expect(storage.dump()['social:tasks']).toBe('[]');
  });

  it('an account switch clears the queue — the departing intents never fire as the next viewer', async () => {
    const t = scriptedTransport(['offline']);
    const storage = memorySocialStorage();
    const Badge = () => {
      const { toggle } = useLikeToggle(POST);
      return <Text testID="badge" onPress={toggle} />;
    };
    const at = (user: { id: string; displayName: string } | null) => (
      <SocialEngineProvider transport={t.transport} currentUser={user} storage={storage}>
        <Badge />
      </SocialEngineProvider>
    );
    const view = await render(at(VIEWER));
    await fireEvent.press(view.getByTestId('badge'));
    await flush();
    expect(JSON.parse(storage.dump()['social:tasks'])).toHaveLength(1);

    await view.rerender(at({ id: 'u2', displayName: 'Kitas' }));
    await flush();
    expect(storage.dump()['social:tasks'] ?? '[]').toBe('[]');
    expect(t.calls).toHaveLength(1);
  });
});



// Every setLiked hands back a promise the test settles by hand,
// so the arrival order of answers is the test's to choose
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}







// -----------------------------------------------------------
// deferred
// -----------------------------------------------------------
//
// A promise the test settles by hand.
//
// Used by:
//   - manualTransport (below)
// -----------------------------------------------------------

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};







// -----------------------------------------------------------
// manualTransport
// -----------------------------------------------------------
//
// A transport whose every setLiked hands back a deferred the
// test settles by hand, so the arrival order of answers is the
// test's to choose.
//
// Used by:
//   - mountManual (below)
// -----------------------------------------------------------

function manualTransport() {
  const calls: { target: LikeTarget; liked: boolean; settle: Deferred<LikeResult> }[] = [];
  const transport: SocialTransport = {
    setLiked(target, liked) {
      const settle = deferred<LikeResult>();
      calls.push({ target, liked, settle });
      return settle.promise;
    },
    fetchPoll: async () => null,
    vote: async () => {
      throw new Error('not under test');
    },
  };
  return { transport, calls };
}







// -----------------------------------------------------------
// mountManual
// -----------------------------------------------------------
//
// One useLikeToggle per given post under a provider wired to
// the manual transport and a hand-fired restore bus.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function mountManual(posts: { id: string; likedByMe: boolean; likeCount: number }[]) {
  const t = manualTransport();
  const bus = restoreBus();
  const storage = memorySocialStorage();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SocialEngineProvider transport={t.transport} currentUser={VIEWER} storage={storage} onNetworkRestore={bus.subscribe}>
      {children}
    </SocialEngineProvider>
  );
  // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed-length list: the same hooks run in the same order every render
  const hook = await renderHook(() => posts.map((post) => useLikeToggle(post)), { wrapper });
  await flush();
  return { ...t, bus, storage, hook };
}


describe('one writer per target — the replay and the live lane', () => {
  it("a tap during the replay queues BEHIND it, and the replay's late answer never lands over the newer tap", async () => {
    const m = await mountManual([{ id: 'p1', likedByMe: true, likeCount: 1 }]);
    const view = () => m.hook.result.current[0];

    // In a tunnel: the unlike fails healable and is parked
    await act(async () => view().toggle());
    m.calls[0].settle.reject(OFFLINE());
    await flush();
    expect(view().liked).toBe(false);

    // Signal returns: the replayed unlike goes on the wire…
    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls.map((c) => c.liked)).toEqual([false, false]);

    // …and the reader changes their mind while it is in flight
    await act(async () => view().toggle());
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(view().liked).toBe(true);

    // The replay answers first — superseded, it leaves the view
    // to the newer tap, which only now goes on the wire
    m.calls[1].settle.resolve({ liked: false, likeCount: 0 });
    await flush();
    expect(m.calls.map((c) => c.liked)).toEqual([false, false, true]);
    expect(view().liked).toBe(true);
    expect(view().pending).toBe(true);

    m.calls[2].settle.resolve({ liked: true, likeCount: 1 });
    await flush();
    expect(view()).toMatchObject({ liked: true, likeCount: 1, pending: false });
    expect(m.storage.dump()['social:tasks']).toBe('[]');
  });

  it('a parked intent whose target already has a live call running is stale — dropped unsent', async () => {
    const m = await mountManual([{ id: 'p1', likedByMe: false, likeCount: 4 }]);
    const view = () => m.hook.result.current[0];

    // A like parked offline, then an unlike tapped live
    await act(async () => view().toggle());
    m.calls[0].settle.reject(OFFLINE());
    await flush();
    await act(async () => view().toggle());
    await flush();
    expect(m.calls.map((c) => c.liked)).toEqual([true, false]);

    // The restore signal fires while the live unlike is on the
    // wire: the older parked like must never reach the server
    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.storage.dump()['social:tasks']).toBe('[]');

    m.calls[1].settle.resolve({ liked: false, likeCount: 4 });
    await flush();
    expect(view()).toMatchObject({ liked: false, likeCount: 4, pending: false });
  });

  it('an entry the live lane purged after the drain listed it is skipped, never replayed stale', async () => {
    const m = await mountManual([
      { id: 'p1', likedByMe: false, likeCount: 0 },
      { id: 'p2', likedByMe: false, likeCount: 0 },
    ]);
    const first = () => m.hook.result.current[0];
    const second = () => m.hook.result.current[1];

    // Both liked in the tunnel — two parked intents
    await act(async () => first().toggle());
    m.calls[0].settle.reject(OFFLINE());
    await flush();
    await act(async () => second().toggle());
    m.calls[1].settle.reject(OFFLINE());
    await flush();

    // The drain starts on p1 (held on the wire)…
    await act(async () => m.bus.fire());
    await flush();
    expect(m.calls.map((c) => c.target.id)).toEqual(['p1', 'p2', 'p1']);

    // …while p2 is un-liked live and lands — purging its parked like
    await act(async () => second().toggle());
    await flush();
    m.calls[3].settle.resolve({ liked: false, likeCount: 0 });
    await flush();

    // p1's replay settles; the walk reaches p2's stale entry
    m.calls[2].settle.resolve({ liked: true, likeCount: 1 });
    await flush();
    expect(m.calls.map((c) => `${c.target.id}:${c.liked}`)).toEqual(['p1:true', 'p2:true', 'p1:true', 'p2:false']);
    expect(second().liked).toBe(false);
    expect(first().liked).toBe(true);
    expect(m.storage.dump()['social:tasks']).toBe('[]');
  });
});
