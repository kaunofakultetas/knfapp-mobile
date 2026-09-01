// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine activity hooks
//
//  useNotifications: an unsupported transport is inert, pages
//  dedupe by id, markAllRead flips optimistically and a wire
//  refusal restores the flags and notifies. useUnreadBadge:
//  capping, the AppState gate and the poll cadence on fake
//  timers, overlapping probes sharing one request.
//
//  Modules are imported directly (not through the barrel) so
//  this suite runs before the package's other hooks exist.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { NotificationsPage, SocialNotice, SocialTransport } from '../../core/transport';
import type { SocialNotification } from '../../core/types';
import { SocialEngineProvider } from '../../provider';
import { useNotifications } from '../useNotifications';
import { useUnreadBadge } from '../useUnreadBadge';


const BASE = Date.parse('2026-03-01T12:00:00.000Z');

// The like/poll core is required by the transport interface but
// never touched here
const baseTransport = (): SocialTransport => ({
  setLiked: async () => ({ liked: false, likeCount: 0 }),
  fetchPoll: async () => null,
  vote: async () => {
    throw new Error('unused');
  },
});

// Distinct subjects + a non-groupable kind keep groups 1:1 with
// rows, so group keys read as row ids
const row = (id: string, minutesBack: number, over: Partial<SocialNotification> = {}): SocialNotification => ({
  id,
  kind: 'comment',
  actor: { id: `actor-${id}`, displayName: id },
  createdAt: new Date(BASE - minutesBack * 60000).toISOString(),
  read: false,
  subjectId: `subject-${id}`,
  ...over,
});

const makeWrapper = (transport: SocialTransport, notices: SocialNotice[] = []) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SocialEngineProvider transport={transport} currentUser={{ id: 'u1', displayName: 'Aš' }} notify={(n) => notices.push(n)}>
        {children}
      </SocialEngineProvider>
    );
  };
};

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The hook registers exactly one AppState listener; the last
// 'change' registration on the shared mock is it
const lastChangeHandler = (): ((state: string) => void) => {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls.filter((c) => c[0] === 'change');
  return calls[calls.length - 1][1];
};

describe('useNotifications', () => {
  it('is inert without fetchNotifications', async () => {
    const notices: SocialNotice[] = [];
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(baseTransport(), notices) });
    await flush();

    expect(h.result.current.supported).toBe(false);
    expect(h.result.current.groups).toEqual([]);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.hasMore).toBe(false);

    // Every call resolves without touching anything
    await act(async () => {
      await h.result.current.refresh();
      await h.result.current.loadMore();
      await h.result.current.markAllRead();
    });
    expect(h.result.current.groups).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('pages through the cursor and dedupes repeated ids', async () => {
    const page1: NotificationsPage = { notifications: [row('n1', 0), row('n2', 1)], hasMore: true, cursor: 'c1' };
    const page2: NotificationsPage = { notifications: [row('n2', 1), row('n3', 2)], hasMore: false };
    const fetchNotifications = jest.fn(async (cursor?: string) => (cursor === 'c1' ? page2 : page1));
    const transport = { ...baseTransport(), fetchNotifications };
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(transport) });
    await flush();

    expect(h.result.current.supported).toBe(true);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.groups.map((g) => g.key)).toEqual(['n1', 'n2']);
    expect(h.result.current.hasMore).toBe(true);

    // The overlapping n2 lands only once
    await act(async () => {
      await h.result.current.loadMore();
    });
    expect(fetchNotifications).toHaveBeenLastCalledWith('c1');
    expect(h.result.current.groups.map((g) => g.key)).toEqual(['n1', 'n2', 'n3']);
    expect(h.result.current.hasMore).toBe(false);

    // hasMore false — no further wire call
    await act(async () => {
      await h.result.current.loadMore();
    });
    expect(fetchNotifications).toHaveBeenCalledTimes(2);

    // refresh REPLACES rather than appends
    await act(async () => {
      await h.result.current.refresh();
    });
    expect(h.result.current.groups.map((g) => g.key)).toEqual(['n1', 'n2']);
    expect(h.result.current.hasMore).toBe(true);
  });

  it('groups the held rows (likes on one subject collapse)', async () => {
    const likes: NotificationsPage = {
      notifications: [row('n1', 0, { kind: 'like', subjectId: 'post-9' }), row('n2', 1, { kind: 'like', subjectId: 'post-9' })],
      hasMore: false,
    };
    const transport = { ...baseTransport(), fetchNotifications: jest.fn(async () => likes) };
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(transport) });
    await flush();

    expect(h.result.current.groups).toHaveLength(1);
    expect(h.result.current.groups[0].actors.map((a) => a.id)).toEqual(['actor-n1', 'actor-n2']);
  });

  it('markAllRead flips optimistically and settles on success', async () => {
    const markNotificationsRead = jest.fn(async () => {});
    const page: NotificationsPage = { notifications: [row('n1', 0), row('n2', 1, { read: true })], hasMore: false };
    const transport = { ...baseTransport(), fetchNotifications: jest.fn(async () => page), markNotificationsRead };
    const notices: SocialNotice[] = [];
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(transport, notices) });
    await flush();
    expect(h.result.current.groups.map((g) => g.read)).toEqual([false, true]);

    await act(async () => {
      await h.result.current.markAllRead();
    });
    expect(markNotificationsRead).toHaveBeenCalledTimes(1);
    expect(h.result.current.groups.map((g) => g.read)).toEqual([true, true]);
    expect(notices).toEqual([]);
  });

  it('a refused markAllRead restores the flags and notifies', async () => {
    const gate = deferred<void>();
    const markNotificationsRead = jest.fn(() => gate.promise);
    const page: NotificationsPage = { notifications: [row('n1', 0), row('n2', 1, { read: true })], hasMore: false };
    const transport = { ...baseTransport(), fetchNotifications: jest.fn(async () => page), markNotificationsRead };
    const notices: SocialNotice[] = [];
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(transport, notices) });
    await flush();

    // The flip shows while the wire is still pending
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = h.result.current.markAllRead();
    });
    expect(h.result.current.groups.map((g) => g.read)).toEqual([true, true]);
    expect(markNotificationsRead).toHaveBeenCalledTimes(1);

    // The refusal restores exactly the flags the flip changed
    await act(async () => {
      gate.reject(new Error('nope'));
      await done;
    });
    expect(h.result.current.groups.map((g) => g.read)).toEqual([false, true]);
    expect(notices).toEqual([{ level: 'error', code: 'notifications_failed' }]);
  });

  it('a backend without markNotificationsRead still flips locally', async () => {
    const page: NotificationsPage = { notifications: [row('n1', 0)], hasMore: false };
    const transport = { ...baseTransport(), fetchNotifications: jest.fn(async () => page) };
    const notices: SocialNotice[] = [];
    const h = await renderHook(() => useNotifications(), { wrapper: makeWrapper(transport, notices) });
    await flush();

    await act(async () => {
      await h.result.current.markAllRead();
    });
    expect(h.result.current.groups.map((g) => g.read)).toEqual([true]);
    expect(notices).toEqual([]);
  });
});

describe('useUnreadBadge', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays empty forever without fetchUnreadCount', async () => {
    const h = await renderHook(() => useUnreadBadge(), { wrapper: makeWrapper(baseTransport()) });
    await flush();
    expect(h.result.current.badge).toBe('');

    await act(async () => {
      await h.result.current.refresh();
    });
    await act(async () => {
      jest.advanceTimersByTime(120000);
    });
    expect(h.result.current.badge).toBe('');
  });

  it('caps the badge at the default 30 and hides zero', async () => {
    let count = 0;
    const transport = { ...baseTransport(), fetchUnreadCount: jest.fn(async () => count) };
    const h = await renderHook(() => useUnreadBadge(), { wrapper: makeWrapper(transport) });
    await flush();
    expect(h.result.current.badge).toBe('');

    const set = async (n: number) => {
      count = n;
      await act(async () => {
        await h.result.current.refresh();
      });
    };
    await set(1);
    expect(h.result.current.badge).toBe('1');
    await set(29);
    expect(h.result.current.badge).toBe('29');
    await set(30);
    expect(h.result.current.badge).toBe('30+');
    await set(445);
    expect(h.result.current.badge).toBe('30+');
    await set(0);
    expect(h.result.current.badge).toBe('');
  });

  it('honours a custom cap', async () => {
    let count = 9;
    const transport = { ...baseTransport(), fetchUnreadCount: jest.fn(async () => count) };
    const h = await renderHook(() => useUnreadBadge({ cap: 10 }), { wrapper: makeWrapper(transport) });
    await flush();
    expect(h.result.current.badge).toBe('9');

    count = 10;
    await act(async () => {
      await h.result.current.refresh();
    });
    expect(h.result.current.badge).toBe('10+');
  });

  it('polls on the interval only while active, resuming with an immediate probe', async () => {
    let count = 1;
    const fetchUnreadCount = jest.fn(async () => count);
    const transport = { ...baseTransport(), fetchUnreadCount };
    const h = await renderHook(() => useUnreadBadge(), { wrapper: makeWrapper(transport) });
    await flush();
    // The mock's non-string currentState counts as active — the
    // mount probe ran
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);
    expect(h.result.current.badge).toBe('1');

    count = 2;
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    expect(h.result.current.badge).toBe('2');

    // Backgrounded: three intervals pass, nobody asks
    count = 3;
    await act(async () => {
      lastChangeHandler()('background');
      jest.advanceTimersByTime(90000);
    });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    expect(h.result.current.badge).toBe('2');

    // Foreground again: an immediate probe, then the cadence
    await act(async () => {
      lastChangeHandler()('active');
    });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(3);
    expect(h.result.current.badge).toBe('3');

    count = 4;
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(4);
    expect(h.result.current.badge).toBe('4');

    // Unmount clears the interval
    await h.unmount();
    await act(async () => {
      jest.advanceTimersByTime(120000);
    });
    expect(fetchUnreadCount).toHaveBeenCalledTimes(4);
  });

  it('honours a custom intervalMs', async () => {
    let count = 1;
    const fetchUnreadCount = jest.fn(async () => count);
    const transport = { ...baseTransport(), fetchUnreadCount };
    const h = await renderHook(() => useUnreadBadge({ intervalMs: 5000 }), { wrapper: makeWrapper(transport) });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);

    count = 8;
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await flush();
    expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    expect(h.result.current.badge).toBe('8');
    h.unmount();
  });

  it('overlapping probes share one request', async () => {
    const gate = deferred<number>();
    const fetchUnreadCount = jest.fn(() => gate.promise);
    const transport = { ...baseTransport(), fetchUnreadCount };
    const h = await renderHook(() => useUnreadBadge(), { wrapper: makeWrapper(transport) });
    // The mount probe is still on the wire
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);

    // Two manual refreshes and a poll tick all ride it
    await act(async () => {
      void h.result.current.refresh();
      void h.result.current.refresh();
      jest.advanceTimersByTime(30000);
    });
    expect(fetchUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve(12);
    });
    await flush();
    expect(h.result.current.badge).toBe('12');
    h.unmount();
  });

  it('guests are inert: useNotifications reports unsupported and never asks the wire', async () => {
    const fetchNotifications = jest.fn(async () => ({ notifications: [], hasMore: false }));
    const transport: SocialTransport = {
      setLiked: async () => ({ liked: false, likeCount: 0 }),
      fetchPoll: async () => null,
      vote: async () => {
        throw new Error('not under test');
      },
      fetchNotifications,
    };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <SocialEngineProvider transport={transport} currentUser={null}>
        {children}
      </SocialEngineProvider>
    );
    const h = await renderHook(() => useNotifications(), { wrapper: Wrapper });
    await flush();
    expect(h.result.current.supported).toBe(false);
    expect(h.result.current.loading).toBe(false);
    await act(async () => h.result.current.refresh());
    await act(async () => h.result.current.markAllRead());
    expect(fetchNotifications).not.toHaveBeenCalled();
  });

  it('guests carry no badge and the probe never runs', async () => {
    jest.useFakeTimers();
    try {
      const fetchUnreadCount = jest.fn(async () => 7);
      const transport: SocialTransport = {
        setLiked: async () => ({ liked: false, likeCount: 0 }),
        fetchPoll: async () => null,
        vote: async () => {
          throw new Error('not under test');
        },
        fetchUnreadCount,
      };
      const Wrapper = ({ children }: { children: ReactNode }) => (
        <SocialEngineProvider transport={transport} currentUser={null}>
          {children}
        </SocialEngineProvider>
      );
      const h = await renderHook(() => useUnreadBadge({ intervalMs: 1000 }), { wrapper: Wrapper });
      await act(async () => {
        jest.advanceTimersByTime(3500);
      });
      await flush();
      await act(async () => h.result.current.refresh());
      expect(fetchUnreadCount).not.toHaveBeenCalled();
      expect(h.result.current.badge).toBe('');
    } finally {
      jest.useRealTimers();
    }
  });
});
