// -----------------------------------------------------------
//  [*] Tests — the offline task queue, end to end
//
//  A like tapped while the transport is down KEEPS its
//  optimistic shadow and waits in the queue; the host's
//  restore signal drains it with the viewer's FINAL intent,
//  once per target. A healable replay failure keeps the rest
//  waiting, a definitive one drops that task with one notice,
//  a persisted queue replays on the next signed-in mount, and
//  an account switch throws the departing viewer's intents
//  away.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactNode } from 'react';

import { memorySocialStorage } from '../../core/storage';
import type { LikeResult, LikeTarget, SocialNotice, SocialTransport } from '../../core/transport';
import { SocialEngineProvider } from '../../provider';
import { useLikeToggle } from '../useLikeToggle';


const VIEWER = { id: 'u1', displayName: 'Aš' };
const POST = { id: 'p1', likedByMe: false, likeCount: 4 };

const OFFLINE = () => Object.assign(new Error('offline'), { status: 0 });


// setLiked scripted per call: 'offline' rejects retryable,
// 'refuse' rejects definitively, a LikeResult resolves
type Script = 'offline' | 'refuse' | LikeResult;

function scriptedTransport(script: Script[]) {
  const calls: { target: LikeTarget; liked: boolean }[] = [];
  const transport: SocialTransport = {
    async setLiked(target, liked) {
      calls.push({ target, liked });
      const step = script.shift();
      if (step === 'offline') throw OFFLINE();
      if (step === 'refuse') throw Object.assign(new Error('refused'), { status: 422 });
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

// The host's restore signal, fired by hand
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

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

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
