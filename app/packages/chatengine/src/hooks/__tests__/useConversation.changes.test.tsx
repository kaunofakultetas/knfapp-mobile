// -----------------------------------------------------------
//  [*] Tests — a resync applies edits and unsends made while
//  the client was away, even outside the newest page
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';


// The signed-in viewer
const SELF = { id: 'u1', displayName: 'Me' };







// -----------------------------------------------------------
// iso
// -----------------------------------------------------------
//
// The i-th minute of one fixed morning, as an ISO stamp — rows
// sort by it.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const iso = (i: number) => new Date(Date.UTC(2026, 7, 29, 10, i, 0)).toISOString();







// -----------------------------------------------------------
// row
// -----------------------------------------------------------
//
// A foreign row stamped at minute i.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const row = (id: string, i: number): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: iso(i), isOwn: false, status: 'read', reactions: [], deleted: false });







describe('useConversation change feed', () => {
  it('applies a change to a row above the newest page on reconnect', async () => {
    const transport = fakeTransport({ self: SELF, messages: Array.from({ length: 6 }, (_, i) => row(`m${i}`, i)), pageSize: 3 });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    // Page older rows in so m0 is held, then the server edits m0 and unsends m1 "while we are away"
    await act(async () => {
      await h.result.current.loadOlder();
    });
    await waitFor(() => expect(h.result.current.messages.some((m) => m.id === 'm0')).toBe(true));
    await transport.editMessage('c1', 'm0', 'pataisyta');
    await transport.deleteMessage('c1', 'm1');
    await act(async () => {
      transport.setStatus('disconnected');
      transport.setStatus('connected');
    });
    await waitFor(() => expect(h.result.current.messages.find((m) => m.id === 'm0')?.text).toBe('pataisyta'));
    expect(h.result.current.messages.find((m) => m.id === 'm1')?.deleted).toBe(true);
    expect(transport.calls.filter((c) => c.method === 'fetchChanges')).toHaveLength(1);
  });
});


// KNF-115 (client half): the change cursor only ever moves to a
// point every held row is at least as fresh as — the feed's own
// cursor after a successful feed, the old one after a failed
// feed, and never forward on a forward page after a jump
describe('useConversation change cursor', () => {
  const sinceOfFeeds = (calls: { method: string; args: unknown[] }[]) =>
    calls.filter((c) => c.method === 'fetchChanges').map((c) => c.args[1] as string);

  const mount = async (options: { pageSize?: number; rows?: number } = {}) => {
    const transport = fakeTransport({ self: SELF, messages: Array.from({ length: options.rows ?? 4 }, (_, i) => row(`m${i}`, i)), pageSize: options.pageSize ?? 50 });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    return { transport, h };
  };

  const reconnect = async (transport: ReturnType<typeof fakeTransport>) => {
    await act(async () => {
      transport.setStatus('disconnected');
      transport.setStatus('connected');
    });
  };

  it('the next feed resumes from the previous FEED cursor, not the older page cursor', async () => {
    const { transport, h } = await mount();
    const returned: string[] = [];
    // The fake always offers the feed
    const original = transport.fetchChanges!.bind(transport);
    transport.fetchChanges = async (conversationId, since) => {
      const page = await original(conversationId, since);
      returned.push(page.cursor);
      return page;
    };
    await reconnect(transport);
    await waitFor(() => expect(returned).toHaveLength(1));
    await transport.editMessage('c1', 'm1', 'vėliau');
    await reconnect(transport);
    await waitFor(() => expect(sinceOfFeeds(transport.calls)).toHaveLength(2));
    // Exactly the cursor the first feed answered — the resync page
    // was read BEFORE that feed, so its cursor is the older one
    expect(sinceOfFeeds(transport.calls)[1]).toBe(returned[0]);
    await waitFor(() => expect(h.result.current.messages.find((m) => m.id === 'm1')?.text).toBe('vėliau'));
  });

  it('a failed feed keeps the old cursor, so the next resync asks again', async () => {
    const { transport } = await mount();
    await reconnect(transport);
    await waitFor(() => expect(sinceOfFeeds(transport.calls)).toHaveLength(1));
    const first = sinceOfFeeds(transport.calls)[0];
    transport.fail('fetchChanges', new Error('offline'));
    await reconnect(transport);
    await waitFor(() => expect(sinceOfFeeds(transport.calls)).toHaveLength(2));
    // The failed call asked from the good cursor …
    const afterGood = sinceOfFeeds(transport.calls)[1];
    expect(afterGood > first).toBe(true);
    await reconnect(transport);
    await waitFor(() => expect(sinceOfFeeds(transport.calls)).toHaveLength(3));
    // … and the next one asks from the SAME cursor again
    expect(sinceOfFeeds(transport.calls)[2]).toBe(afterGood);
  });

  it('a forward page after a jump never moves the cursor past the jumped window', async () => {
    // 60 rows: a jump to m1 anchors half a page around it, far
    // from the head — the window is detached
    const { transport, h } = await mount({ pageSize: 50, rows: 60 });
    await act(async () => {
      await h.result.current.jumpTo('m1');
    });
    expect(h.result.current.hasNewer).toBe(true);
    // Edited AFTER the jump's page was read: only the change feed
    // can bring it, and only from the jump's cursor
    await transport.editMessage('c1', 'm1', 'po šuolio');
    await act(async () => {
      await h.result.current.loadNewer();
    });
    expect(h.result.current.hasNewer).toBe(false);
    // Reaching the head re-attaches the window and resyncs — the
    // feed must resume from the jump, not from the forward page
    await waitFor(() => expect(h.result.current.messages.find((m) => m.id === 'm1')?.text).toBe('po šuolio'));
  });
});
