import React from 'react';
import { render, renderHook } from '@testing-library/react-native';

import { ChatEngineProvider, useChatEngine } from '..';
import { memoryStorage } from '../storage';

describe('useChatEngine', () => {
  it('throws a named error outside its provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useChatEngine())).rejects.toThrow(/ChatEngineProvider/);
    spy.mockRestore();
  });
});

describe('per-account storage scoping', () => {
  // Conversation ids are shared between accounts (a direct
  // chat has ONE id for both members), so persisted outbox and
  // draft keys must never leak from one signed-in account to
  // the next on the same device
  const transport = {} as never;
  const user = (id: string) => ({ id, username: id, displayName: id }) as never;

  async function envFor(userId: string, base: ReturnType<typeof memoryStorage>) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatEngineProvider transport={transport} currentUser={user(userId)} storage={base}>
        {children}
      </ChatEngineProvider>
    );
    const hook = await renderHook(() => useChatEngine(), { wrapper });
    return hook.result.current;
  }

  it('one account never reads what another account persisted', async () => {
    const base = memoryStorage();

    await (await envFor('user-a', base)).storage.setItem('outbox:conv-1', 'a-failed-send');
    expect(await (await envFor('user-b', base)).storage.getItem('outbox:conv-1')).toBeNull();
    expect(await (await envFor('user-a', base)).storage.getItem('outbox:conv-1')).toBe('a-failed-send');

    // The underlying keys really are distinct rows
    expect(Object.keys(base.dump())).toEqual(['u:user-a:outbox:conv-1']);
  });

  it('keeps the scoped storage identity across a re-created user object with the same id', async () => {
    // The host hands a NEW user object on every session refresh
    // (each foreground); a fresh storage identity re-ran every
    // room's first load and stacked the paged history on top
    const base = memoryStorage();
    const seen: unknown[] = [];
    const Probe = () => {
      seen.push(useChatEngine().storage);
      return null;
    };
    const tree = (id: string) => (
      <ChatEngineProvider transport={transport} currentUser={user(id)} storage={base}>
        <Probe />
      </ChatEngineProvider>
    );
    const view = await render(tree('user-a'));
    await view.rerender(tree('user-a'));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);

    // A different account still gets its own namespace
    await view.rerender(tree('user-b'));
    expect(seen[2]).not.toBe(seen[0]);
  });
});
