// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine provider
//
//  The env's lifecycle rules: an account CHANGE (login, logout,
//  switch) wipes both shadow stores, while a re-render of the
//  same account — even as a fresh user object — keeps them;
//  requireAuth falls back to the auth_required notice only when
//  the host passed no handler; and a hook outside the provider
//  fails loudly instead of limping on a null env.
// -----------------------------------------------------------

import { render, renderHook } from '@testing-library/react-native';

import type { SocialTransport } from '../../core/transport';
import type { SocialUser } from '../../core/types';
import { SocialEngineProvider, useSocialEngine, type SocialEngineEnv } from '../index';


// The provider never calls the transport itself — a minimal
// stub satisfies the interface
const makeTransport = (): SocialTransport => ({
  setLiked: async () => ({ liked: true, likeCount: 1 }),
  fetchPoll: async () => null,
  vote: async () => {
    throw new Error('not exercised here');
  },
});

const ONA: SocialUser = { id: 'u-ona', displayName: 'Ona' };
const TOMAS: SocialUser = { id: 'u-tomas', displayName: 'Tomas' };


// The latest env, captured through the real context path
let seen: SocialEngineEnv | null = null;

function Capture() {
  seen = useSocialEngine();
  return null;
}


// Mount with one account, drop intents into both stores, then
// re-render with the next account and report what survived
const changeAccount = async (before: SocialUser | null, after: SocialUser | null) => {
  const transport = makeTransport();
  const screen = await render(
    <SocialEngineProvider transport={transport} currentUser={before}>
      <Capture />
    </SocialEngineProvider>,
  );
  const env = seen as SocialEngineEnv;
  env.postShadows.patch('p1', { liked: true });
  env.userShadows.patch('u1', { relationship: 'connected' });


  await screen.rerender(
    <SocialEngineProvider transport={transport} currentUser={after}>
      <Capture />
    </SocialEngineProvider>,
  );
  // The stores are stable instances — only their CONTENTS react
  // to the account change
  expect((seen as SocialEngineEnv).postShadows).toBe(env.postShadows);
  expect((seen as SocialEngineEnv).userShadows).toBe(env.userShadows);
  return env;
};


describe('SocialEngineProvider — account changes', () => {
  beforeEach(() => {
    seen = null;
  });

  it('login (guest → user) wipes both shadow stores', async () => {
    const env = await changeAccount(null, ONA);
    expect(env.postShadows.get('p1')).toBeUndefined();
    expect(env.userShadows.get('u1')).toBeUndefined();
  });

  it('logout (user → guest) wipes both shadow stores', async () => {
    const env = await changeAccount(ONA, null);
    expect(env.postShadows.get('p1')).toBeUndefined();
    expect(env.userShadows.get('u1')).toBeUndefined();
  });

  it('switching accounts wipes both shadow stores', async () => {
    const env = await changeAccount(ONA, TOMAS);
    expect(env.postShadows.get('p1')).toBeUndefined();
    expect(env.userShadows.get('u1')).toBeUndefined();
  });

  it('a re-render of the same account keeps the shadows', async () => {
    // A fresh object with the same id is the same ACCOUNT — a
    // profile refetch must not throw the viewer's intents away
    const env = await changeAccount(ONA, { ...ONA });
    expect(env.postShadows.get('p1')).toEqual({ liked: true });
    expect(env.userShadows.get('u1')).toEqual({ relationship: 'connected' });
  });
});


describe('SocialEngineProvider — requireAuth', () => {
  beforeEach(() => {
    seen = null;
  });

  it('emits the auth_required notice when the host passed no handler', async () => {
    const notify = jest.fn();
    await render(
      <SocialEngineProvider transport={makeTransport()} notify={notify}>
        <Capture />
      </SocialEngineProvider>,
    );

    (seen as SocialEngineEnv).requireAuth();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ level: 'info', code: 'auth_required' });
  });

  it('a passed onRequireAuth handles the tap and suppresses the notice', async () => {
    const notify = jest.fn();
    const onRequireAuth = jest.fn();
    await render(
      <SocialEngineProvider transport={makeTransport()} notify={notify} onRequireAuth={onRequireAuth}>
        <Capture />
      </SocialEngineProvider>,
    );

    (seen as SocialEngineEnv).requireAuth();
    expect(onRequireAuth).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });
});


describe('useSocialEngine', () => {
  it('throws outside the provider', async () => {
    // React logs render errors before rethrowing — keep the run quiet
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let thrown: unknown = null;
    try {
      await renderHook(() => useSocialEngine());
    } catch (err) {
      thrown = err;
    } finally {
      errorSpy.mockRestore();
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/SocialEngineProvider/);
  });
});
