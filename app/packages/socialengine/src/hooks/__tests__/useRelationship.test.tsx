// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine useRelationship
//
//  The optimistic relationship over the user shadow store and
//  the per-user toggle queue: every action's instant
//  transition, the server's confirmed state winning over the
//  guess (instant-connect answers 'connected' to 'connect'),
//  revert-and-notify on refusal, the guest gate, the
//  unsupported-transport gate and tap-spam coalescing. Imports
//  stay off the barrel: sibling hooks it re-exports are built
//  by other hands and may not exist yet.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { RelationshipAction, SocialNotice, SocialTransport } from '../../core/transport';
import type { RelationshipState } from '../../core/types';
import { SocialEngineProvider } from '../../provider';
import { useRelationship } from '../useRelationship';


const VIEWER = { id: 'u1', displayName: 'Aš' };
const OTHER_ID = 'u9';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

// Controllable promise — tests decide when (and how) each
// transport call settles
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// setRelationship records the call and hands back a deferred
// the test settles by hand; the like/poll methods exist only to
// satisfy the interface
function stubTransport() {
  const calls: { userId: string; action: RelationshipAction }[] = [];
  const pending: Deferred<RelationshipState>[] = [];
  const transport: SocialTransport = {
    setLiked: async () => {
      throw new Error('not under test');
    },
    fetchPoll: async () => null,
    vote: async () => {
      throw new Error('not under test');
    },
    setRelationship(userId, action) {
      calls.push({ userId, action });
      const d = deferred<RelationshipState>();
      pending.push(d);
      return d.promise;
    },
  };
  return { transport, calls, pending };
}

// Settled deferreds resolve through a chain of microtasks (the
// queue's .then/.finally plus the hook's handlers) — drain it
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

async function mount(options: { base?: RelationshipState; guest?: boolean; transport?: SocialTransport } = {}) {
  const t = stubTransport();
  const notices: SocialNotice[] = [];
  const requireAuth = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SocialEngineProvider
      transport={options.transport ?? t.transport}
      currentUser={options.guest ? null : VIEWER}
      notify={(n) => notices.push(n)}
      onRequireAuth={requireAuth}
    >
      {children}
    </SocialEngineProvider>
  );
  const hook = await renderHook(({ base }: { base: RelationshipState }) => useRelationship(OTHER_ID, base), {
    wrapper,
    initialProps: { base: options.base ?? 'none' },
  });
  return { ...t, notices, requireAuth, hook };
}


describe('useRelationship', () => {
  it.each([
    ['connect', 'none', 'outgoing'],
    ['cancel', 'outgoing', 'none'],
    ['accept', 'incoming', 'connected'],
    ['decline', 'incoming', 'none'],
    ['disconnect', 'connected', 'none'],
  ] as const)('%s moves %s to %s before the server answers', async (action, base, expected) => {
    const m = await mount({ base });

    await act(async () => {
      m.hook.result.current.act(action);
    });

    // Nothing settled yet — the transition is purely optimistic
    expect(m.hook.result.current.state).toBe(expected);
    expect(m.hook.result.current.pending).toBe(true);
    expect(m.calls).toEqual([{ userId: OTHER_ID, action }]);
  });

  it("the server's confirmed state wins over the optimistic guess", async () => {
    const m = await mount({ base: 'none' });

    await act(async () => {
      m.hook.result.current.act('connect');
    });
    expect(m.hook.result.current.state).toBe('outgoing');

    // An instant-connect backend answers 'connected' to 'connect'
    m.pending[0].resolve('connected');
    await flush();
    expect(m.hook.result.current.state).toBe('connected');
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([]);
  });

  it('reverts to the pre-tap state and notifies on a refusal', async () => {
    const m = await mount({ base: 'none' });

    await act(async () => {
      m.hook.result.current.act('connect');
    });
    expect(m.hook.result.current.state).toBe('outgoing');

    m.pending[0].reject(Object.assign(new Error('refused'), { status: 500 }));
    await flush();
    expect(m.hook.result.current.state).toBe('none');
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([{ level: 'error', code: 'relationship_failed' }]);
  });

  it('a guest tap asks for auth and never reaches the transport', async () => {
    const m = await mount({ guest: true });
    expect(m.hook.result.current.canAct).toBe(false);

    await act(async () => {
      m.hook.result.current.act('connect');
    });
    expect(m.requireAuth).toHaveBeenCalledTimes(1);
    expect(m.calls).toHaveLength(0);
    expect(m.hook.result.current.state).toBe('none');
    expect(m.hook.result.current.pending).toBe(false);
  });

  it('reports canAct false without setRelationship, and act() is a harmless no-op', async () => {
    // A likes-only backend: the optional method is simply absent
    const bare: SocialTransport = {
      setLiked: async () => {
        throw new Error('not under test');
      },
      fetchPoll: async () => null,
      vote: async () => {
        throw new Error('not under test');
      },
    };
    const m = await mount({ transport: bare });
    expect(m.hook.result.current.canAct).toBe(false);

    await act(async () => {
      m.hook.result.current.act('connect');
    });
    expect(m.hook.result.current.state).toBe('none');
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([]);
    expect(m.requireAuth).not.toHaveBeenCalled();
  });

  it('never marks self or blockedBy actionable', async () => {
    const self = await mount({ base: 'self' });
    expect(self.hook.result.current.canAct).toBe(false);

    const blocked = await mount({ base: 'blockedBy' });
    expect(blocked.hook.result.current.canAct).toBe(false);
  });

  it('dedupes same-intent spam onto the in-flight call', async () => {
    const m = await mount({ base: 'none' });

    await act(async () => {
      for (let i = 0; i < 3; i++) m.hook.result.current.act('connect');
    });
    expect(m.calls).toHaveLength(1);

    m.pending[0].resolve('outgoing');
    await flush();
    expect(m.calls).toHaveLength(1);
    expect(m.hook.result.current.state).toBe('outgoing');
    expect(m.hook.result.current.pending).toBe(false);
  });

  it('coalesces alternating spam to two calls and settles on the final intent', async () => {
    const m = await mount({ base: 'none' });

    // connect / cancel / connect / cancel — the middle two are
    // replaced in the queue and abort silently
    await act(async () => {
      m.hook.result.current.act('connect');
      m.hook.result.current.act('cancel');
      m.hook.result.current.act('connect');
      m.hook.result.current.act('cancel');
    });
    expect(m.calls).toHaveLength(1);
    expect(m.hook.result.current.state).toBe('none');

    m.pending[0].resolve('outgoing');
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].action).toBe('cancel');

    m.pending[1].resolve('none');
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.hook.result.current.state).toBe('none');
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([]);
  });
});
