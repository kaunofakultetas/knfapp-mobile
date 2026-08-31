// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine useLikeToggle
//
//  The optimistic like over the shadow store and the toggle
//  queue: the instant flip, tap-spam coalescing (at most the
//  in-flight call plus the final intent), revert-and-notify on
//  refusal, the auth route, the guest gate, cross-surface
//  consistency and the stale-shadow / fresh-base no-double-
//  count guarantee. Imports stay off the barrel: sibling hooks
//  it re-exports are built by other hands and may not exist
//  yet.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactNode } from 'react';

import type { LikeResult, LikeTarget, SocialNotice, SocialTransport } from '../../core/transport';
import { SocialEngineProvider } from '../../provider';
import { useLikeToggle } from '../useLikeToggle';


const VIEWER = { id: 'u1', displayName: 'Aš' };
const POST = { id: 'p1', likedByMe: false, likeCount: 4 };

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

// setLiked records the call and hands back a deferred the test
// settles by hand; the poll methods exist only to satisfy the
// interface
function stubTransport() {
  const calls: { target: LikeTarget; liked: boolean }[] = [];
  const pending: Deferred<LikeResult>[] = [];
  const transport: SocialTransport = {
    setLiked(target, liked) {
      calls.push({ target, liked });
      const d = deferred<LikeResult>();
      pending.push(d);
      return d.promise;
    },
    fetchPoll: async () => null,
    vote: async () => {
      throw new Error('not under test');
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

async function mount(options: { guest?: boolean; post?: typeof POST } = {}) {
  const t = stubTransport();
  const notices: SocialNotice[] = [];
  const requireAuth = jest.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SocialEngineProvider
      transport={t.transport}
      currentUser={options.guest ? null : VIEWER}
      notify={(n) => notices.push(n)}
      onRequireAuth={requireAuth}
    >
      {children}
    </SocialEngineProvider>
  );
  const hook = await renderHook(({ post }: { post: typeof POST }) => useLikeToggle(post), {
    wrapper,
    initialProps: { post: options.post ?? POST },
  });
  return { ...t, notices, requireAuth, hook };
}

// A minimal surface for the cross-surface test — two of these
// on one post id must always agree
function LikeBadge({ testID, post }: { testID: string; post: typeof POST }) {
  const { liked, likeCount, toggle } = useLikeToggle(post);
  return <Text testID={testID} onPress={toggle}>{`${liked ? 'liked' : 'unliked'}:${likeCount}`}</Text>;
}


describe('useLikeToggle', () => {
  it('flips liked and count instantly, before the transport answers', async () => {
    const m = await mount();
    expect(m.hook.result.current.canLike).toBe(true);

    await act(async () => {
      m.hook.result.current.toggle();
    });

    // Nothing settled yet — the flip is purely optimistic
    expect(m.calls).toEqual([{ target: { type: 'post', id: 'p1' }, liked: true }]);
    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.hook.result.current.pending).toBe(true);

    m.pending[0].resolve({ liked: true, likeCount: 5 });
    await flush();
    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.hook.result.current.pending).toBe(false);
  });

  it('coalesces five rapid toggles into at most two calls and settles on the final intent', async () => {
    const m = await mount();

    await act(async () => {
      for (let i = 0; i < 5; i++) m.hook.result.current.toggle();
    });

    // Only the first call is in flight; taps 2–5 queued/replaced
    expect(m.calls).toHaveLength(1);
    expect(m.hook.result.current.liked).toBe(true);

    m.pending[0].resolve({ liked: true, likeCount: 5 });
    await flush();

    // The final intent (tap 5: like) runs as the second call
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1].liked).toBe(true);

    m.pending[1].resolve({ liked: true, likeCount: 5 });
    await flush();
    expect(m.calls).toHaveLength(2);
    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.hook.result.current.pending).toBe(false);
    // The superseded middle taps aborted silently
    expect(m.notices).toEqual([]);
  });

  it('reverts and notifies on a definitive refusal', async () => {
    const m = await mount();

    await act(async () => {
      m.hook.result.current.toggle();
    });
    expect(m.hook.result.current.liked).toBe(true);

    m.pending[0].reject(Object.assign(new Error('refused'), { status: 400 }));
    await flush();
    expect(m.hook.result.current.liked).toBe(false);
    expect(m.hook.result.current.likeCount).toBe(4);
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([{ level: 'error', code: 'like_failed' }]);
    expect(m.requireAuth).not.toHaveBeenCalled();
  });

  it('reverts and routes to requireAuth on an auth refusal', async () => {
    const m = await mount();

    await act(async () => {
      m.hook.result.current.toggle();
    });

    m.pending[0].reject(Object.assign(new Error('expired'), { status: 401 }));
    await flush();
    expect(m.hook.result.current.liked).toBe(false);
    expect(m.hook.result.current.likeCount).toBe(4);
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.requireAuth).toHaveBeenCalledTimes(1);
    // The auth route replaces the generic failure notice
    expect(m.notices).toEqual([]);
  });

  it('a guest tap asks for auth and never reaches the transport', async () => {
    const m = await mount({ guest: true });
    expect(m.hook.result.current.canLike).toBe(false);

    await act(async () => {
      m.hook.result.current.toggle();
    });
    expect(m.requireAuth).toHaveBeenCalledTimes(1);
    expect(m.calls).toHaveLength(0);
    expect(m.hook.result.current.liked).toBe(false);
    expect(m.hook.result.current.likeCount).toBe(4);
    expect(m.hook.result.current.pending).toBe(false);
  });

  it('two surfaces on the same post id move together from one toggle', async () => {
    const t = stubTransport();
    // Distinct row objects, same id — consistency is keyed by id,
    // not by object identity
    const screen = await render(
      <SocialEngineProvider transport={t.transport} currentUser={VIEWER}>
        <LikeBadge testID="feed" post={{ ...POST }} />
        <LikeBadge testID="profile" post={{ ...POST }} />
      </SocialEngineProvider>,
    );

    await fireEvent.press(screen.getByTestId('feed'));
    expect(screen.getByTestId('feed').props.children).toBe('liked:5');
    expect(screen.getByTestId('profile').props.children).toBe('liked:5');

    t.pending[0].resolve({ liked: true, likeCount: 5 });
    await flush();
    expect(screen.getByTestId('feed').props.children).toBe('liked:5');
    expect(screen.getByTestId('profile').props.children).toBe('liked:5');
    expect(t.calls).toHaveLength(1);
  });

  it('a fresher base with a stale shadow never double counts', async () => {
    const m = await mount();

    await act(async () => {
      m.hook.result.current.toggle();
    });
    m.pending[0].resolve({ liked: true, likeCount: 5 });
    await flush();
    expect(m.hook.result.current.likeCount).toBe(5);

    // The refetched row already includes the viewer's like; the
    // shadow ({ liked: true }) now agrees with the base, so the
    // diff — and the bump — is zero
    await m.hook.rerender({ post: { id: 'p1', likedByMe: true, likeCount: 5 } });
    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
  });

  it('reverts a late failure to the last CONFIRMED flag, not the previous tap\u2019s guess', async () => {
    // tap1 like (in flight) \u2192 tap2 unlike (queued) \u2192 tap3 like
    // (replaces tap2). tap1 SUCCEEDS \u2014 server liked \u2014 then tap3
    // fails: the display must land on the confirmed liked state,
    // never on aborted tap2's optimistic 'false'
    const m = await mount();
    await act(async () => m.hook.result.current.toggle());
    await act(async () => m.hook.result.current.toggle());
    await act(async () => m.hook.result.current.toggle());

    await act(async () => {
      m.pending[0].resolve({ liked: true, likeCount: 5 });
    });
    await flush();
    await act(async () => {
      m.pending[1].reject(Object.assign(new Error('down'), { status: 422 }));
    });
    await flush();

    expect(m.hook.result.current.liked).toBe(true);
    expect(m.hook.result.current.likeCount).toBe(5);
    expect(m.notices).toEqual([{ level: 'error', code: 'like_failed' }]);
    expect(m.calls).toHaveLength(2);
  });

  it('keeps pending up while the queued final intent is still on the wire', async () => {
    const m = await mount();
    await act(async () => m.hook.result.current.toggle());
    await act(async () => m.hook.result.current.toggle());
    expect(m.hook.result.current.pending).toBe(true);

    // The first call settles; the queued opposite intent starts \u2014
    // the button must NOT read settled in between
    await act(async () => {
      m.pending[0].resolve({ liked: true, likeCount: 5 });
    });
    await flush();
    expect(m.hook.result.current.pending).toBe(true);
    expect(m.hook.result.current.liked).toBe(false);

    await act(async () => {
      m.pending[1].resolve({ liked: false, likeCount: 4 });
    });
    await flush();
    expect(m.hook.result.current.pending).toBe(false);
  });

  it('an intermediate failure stays quiet \u2014 the final attempt tells the truth', async () => {
    const m = await mount();
    await act(async () => m.hook.result.current.toggle());
    await act(async () => m.hook.result.current.toggle());

    await act(async () => {
      m.pending[0].reject(Object.assign(new Error('blip'), { status: 422 }));
    });
    await flush();
    expect(m.notices).toEqual([]);

    await act(async () => {
      m.pending[1].resolve({ liked: false, likeCount: 4 });
    });
    await flush();
    expect(m.hook.result.current.liked).toBe(false);
    expect(m.hook.result.current.pending).toBe(false);
    expect(m.notices).toEqual([]);
  });

  it('a settle from before an account switch touches nothing \u2014 the fresh store stays clean', async () => {
    const t = stubTransport();
    const KITAS = { id: 'u2', displayName: 'Kitas' };
    const view = await render(
      <SocialEngineProvider transport={t.transport} currentUser={VIEWER}>
        <LikeBadge testID="badge" post={POST} />
      </SocialEngineProvider>,
    );
    await fireEvent.press(view.getByTestId('badge'));
    expect(view.getByTestId('badge').props.children).toBe('liked:5');

    // The account changes while the call is on the wire; the
    // provider wipes the stores (epoch moves)
    await view.rerender(
      <SocialEngineProvider transport={t.transport} currentUser={KITAS}>
        <LikeBadge testID="badge" post={POST} />
      </SocialEngineProvider>,
    );
    await flush();
    expect(view.getByTestId('badge').props.children).toBe('unliked:4');

    // The departed viewer's call settles \u2014 and must not re-seed
    // the new account's store
    await act(async () => {
      t.pending[0].resolve({ liked: true, likeCount: 5 });
    });
    await flush();
    expect(view.getByTestId('badge').props.children).toBe('unliked:4');
  });
});
