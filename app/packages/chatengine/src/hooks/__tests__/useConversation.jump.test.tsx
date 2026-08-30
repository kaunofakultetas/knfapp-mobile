// -----------------------------------------------------------
//  [*] Tests — jump-to-message beyond the loaded history
//
//  jumpTo anchors an around-window on the target in one round
//  trip; hasNewer detaches the window from the head, loadNewer
//  walks forward and re-attaches, returnToLatest goes straight
//  back. Arrivals while detached only count for the badge.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const stamp = (i: number) => new Date(Date.UTC(2026, 7, 29, 10, 0, i)).toISOString();
const row = (i: number): ChatMessage => ({ id: `m${String(i).padStart(2, '0')}`, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: `t${i}`, createdAt: stamp(i), isOwn: false, status: 'read', reactions: [], deleted: false });

// 40 seeded rows, pages of 10: the first page holds m30..m39, so
// m05 sits far beyond the loaded history; jumpTo's fixed limit of
// 50 makes the around-window's newer half stop at m30 (25 rows)
const seed = () => fakeTransport({ self: SELF, messages: Array.from({ length: 40 }, (_, i) => row(i)), pageSize: 10 });

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
};

describe('useConversation jumpTo / loadNewer / returnToLatest', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const mount = async (transport: ReturnType<typeof seed>) => {
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await flush();
    return h;
  };

  it('anchors a window around a message beyond the loaded history', async () => {
    const transport = seed();
    const h = await mount(transport);
    expect(h.result.current.messages.some((m) => m.id === 'm05')).toBe(false);

    let outcome: 'loaded' | 'anchored' | 'missing' = 'missing';
    await act(async () => {
      outcome = await h.result.current.jumpTo('m05');
    });
    expect(outcome).toBe('anchored');
    expect(h.result.current.messages.some((m) => m.id === 'm05')).toBe(true);
    expect(h.result.current.hasNewer).toBe(true);
    // The transport was asked for the around-window, once
    expect(transport.calls.filter((c) => c.method === 'fetchMessages' && (c.args[1] as { around?: string } | undefined)?.around === 'm05')).toHaveLength(1);

    // A held row needs no fetch; an unknown id is reported, not thrown
    await act(async () => {
      outcome = await h.result.current.jumpTo('m05');
    });
    expect(outcome).toBe('loaded');
    await act(async () => {
      outcome = await h.result.current.jumpTo('nope');
    });
    expect(outcome).toBe('missing');
  });

  it('loadNewer walks the detached window forward and re-attaches at the head', async () => {
    const transport = seed();
    const h = await mount(transport);
    await act(async () => {
      await h.result.current.jumpTo('m05');
    });
    expect(h.result.current.hasNewer).toBe(true);

    await act(async () => {
      await h.result.current.loadNewer();
    });
    await flush();
    expect(h.result.current.hasNewer).toBe(false);
    expect(h.result.current.messages.some((m) => m.id === 'm39')).toBe(true);
    // The forward page kept the window it grew from
    expect(h.result.current.messages.some((m) => m.id === 'm05')).toBe(true);
  });

  it('arrivals while detached only count for the jump-back badge; returnToLatest clears it', async () => {
    const transport = seed();
    const h = await mount(transport);
    await act(async () => {
      await h.result.current.jumpTo('m05');
    });

    await act(async () => {
      transport.push({ type: 'message', message: { ...row(0), id: 'live-1', createdAt: stamp(99) } });
    });
    expect(h.result.current.messages.some((m) => m.id === 'live-1')).toBe(false);
    expect(h.result.current.missedWhileDetached).toBe(1);

    await act(async () => {
      await h.result.current.returnToLatest();
    });
    await flush();
    expect(h.result.current.hasNewer).toBe(false);
    expect(h.result.current.missedWhileDetached).toBe(0);
    expect(h.result.current.messages.some((m) => m.id === 'm39')).toBe(true);
  });
});
