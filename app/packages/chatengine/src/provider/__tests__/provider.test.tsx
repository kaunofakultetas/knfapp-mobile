import React from 'react';
import { renderHook } from '@testing-library/react-native';

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
});
