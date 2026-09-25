// -----------------------------------------------------------
//  [*] Tests — edit mode never overwrites the room's draft
//
//  The composer keeps two buffers: the draft (persisted per
//  room) and, in edit mode, the text of the message being
//  edited (parked draft aside). Leaving mid-edit, typing in
//  edit mode and cancelling must all leave the STORED draft
//  the user actually typed — never the edited message, which
//  one careless send would re-post as a new one.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, memoryStorage, useComposer, type ChatMessage } from '../../index';


// The signed-in viewer
const SELF = { id: 'u1', displayName: 'Me' };
// The room's draft under the provider's per-account namespace
const DRAFT_KEY = `u:${SELF.id}:draft:c1`;
// The own message edit mode takes over
const EDITED: Pick<ChatMessage, 'id' | 'text' | 'isOwn' | 'deleted' | 'editedAt'> = { id: 'm1', text: 'Kur susitinkam?', isOwn: true, deleted: false, editedAt: null };







// -----------------------------------------------------------
// setup
// -----------------------------------------------------------
//
// The composer under fake timers over a memory storage;
// `settle` runs the draft debounce and the promise queue out.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function setup() {
  jest.useFakeTimers();
  const transport = fakeTransport({ self: SELF });
  const storage = memoryStorage();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={storage}>{children}</ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return useComposer('c1', setMessages, messages);
    },
    { wrapper },
  );
  // Let the rehydrate effect settle first
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  const settle = async () => {
    await act(async () => {
      jest.advanceTimersByTime(1000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  };
  return { storage, hook, settle };
}

afterEach(() => jest.useRealTimers());


describe('useComposer edit mode and the persisted draft', () => {
  it('leaving mid-edit keeps the real draft, not the edited message', async () => {
    const { storage, hook, settle } = await setup();
    await act(async () => hook.result.current.onChangeText('labas rytas, kada'));
    await settle();
    expect(storage.dump()[DRAFT_KEY]).toBe('labas rytas, kada');

    await act(async () => hook.result.current.startEdit(EDITED));
    expect(hook.result.current.text).toBe('Kur susitinkam?');
    await act(async () => hook.unmount());
    await settle();
    expect(storage.dump()[DRAFT_KEY]).toBe('labas rytas, kada');
  });

  it('a keystroke in edit mode never reaches the stored draft', async () => {
    const { storage, hook, settle } = await setup();
    await act(async () => hook.result.current.onChangeText('labas rytas, kada'));
    await settle();
    await act(async () => hook.result.current.startEdit(EDITED));
    await act(async () => hook.result.current.onChangeText('Kur susitinkam rytoj?'));
    await settle();
    expect(storage.dump()[DRAFT_KEY]).toBe('labas rytas, kada');
  });

  it('cancelling puts the draft back on screen and in storage at once', async () => {
    const { storage, hook, settle } = await setup();
    await act(async () => hook.result.current.onChangeText('labas rytas, kada'));
    await settle();
    await act(async () => hook.result.current.startEdit(EDITED));
    await act(async () => hook.result.current.onChangeText('Kur susitinkam rytoj?'));
    await act(async () => hook.result.current.cancelEdit());
    expect(hook.result.current.text).toBe('labas rytas, kada');
    await settle();
    expect(storage.dump()[DRAFT_KEY]).toBe('labas rytas, kada');
  });

  it('an edit started from an empty field leaves no draft behind', async () => {
    const { storage, hook, settle } = await setup();
    await act(async () => hook.result.current.startEdit(EDITED));
    await act(async () => hook.result.current.onChangeText('Kur susitinkam?!'));
    await act(async () => hook.unmount());
    await settle();
    expect(storage.dump()[DRAFT_KEY]).toBeUndefined();
  });
});
