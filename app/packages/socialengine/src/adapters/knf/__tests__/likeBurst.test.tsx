// -----------------------------------------------------------
//  [*] Tests — the KNF adapter under the engine's coalescing
//
//  The toggle queue coalesces a tap burst into the request in
//  flight plus the final intent — sound only when every call
//  carries its ABSOLUTE target. Over the real route's
//  semantics (a {liked} body sets, no body flips) a triple
//  tap on an unliked post, all inside the first request's
//  latency, must settle LIKED on the server and on screen;
//  the adapter that fired bare flips landed it unliked
//  (KNF-110). The engine pieces are the real ones: provider,
//  useLikeToggle, the toggle queue and the KNF transport.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SocialEngineProvider } from '../../../provider';
import { useLikeToggle } from '../../../hooks/useLikeToggle';
import { createKnfSocialTransport } from '../index';
import type { HttpClient } from '../wire';


// The signed-in viewer every mount runs as
const VIEWER = { id: 'u1', displayName: 'Aš' };







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Settled requests resolve through the queue's .then/.finally
// chain and the hook's handlers — drain the microtasks.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  });







// -----------------------------------------------------------
// gatedLikeRoute
// -----------------------------------------------------------
//
// The like route exactly as the backend answers it (a {liked}
// body sets, no body flips), with the FIRST request held on a
// gate so the burst lands inside its latency.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function gatedLikeRoute() {
  const server = { liked: false, count: 4 };
  const bodies: unknown[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = true;
  const http: HttpClient = {
    async get<T>(): Promise<T> {
      throw Object.assign(new Error('not under test'), { status: 404 });
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      if (!/\/like$/.test(path)) throw Object.assign(new Error('not under test'), { status: 404 });
      bodies.push(body);
      if (held) {
        held = false;
        await gate;
      }
      const target = (body as { liked?: unknown } | undefined)?.liked;
      const liked = typeof target === 'boolean' ? target : !server.liked;
      if (liked !== server.liked) server.count += liked ? 1 : -1;
      server.liked = liked;
      return { liked: server.liked, likes: server.count } as T;
    },
    async put<T>(): Promise<T> {
      throw Object.assign(new Error('not under test'), { status: 404 });
    },
    async delete<T>(): Promise<T> {
      throw Object.assign(new Error('not under test'), { status: 404 });
    },
  };
  return { http, server, bodies, release: () => release() };
}


describe('the KNF like under a tap burst', () => {
  it('an odd burst lands the final intent — liked, on the server and on screen', async () => {
    const route = gatedLikeRoute();
    const transport = createKnfSocialTransport({ http: route.http });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SocialEngineProvider transport={transport} currentUser={VIEWER}>
        {children}
      </SocialEngineProvider>
    );
    const hook = await renderHook(() => useLikeToggle({ id: 'p1', likedByMe: false, likeCount: 4 }), { wrapper });

    // like → unlike → like, all while the first call is held
    await act(async () => {
      hook.result.current.toggle();
      hook.result.current.toggle();
      hook.result.current.toggle();
    });
    expect(hook.result.current.liked).toBe(true);

    route.release();
    await flush();

    // Two requests reached the wire — the one in flight and the
    // final intent — and both carried their absolute target
    expect(route.bodies).toEqual([{ liked: true }, { liked: true }]);
    expect(route.server).toEqual({ liked: true, count: 5 });
    expect(hook.result.current.liked).toBe(true);
    expect(hook.result.current.likeCount).toBe(5);
    expect(hook.result.current.pending).toBe(false);
  });
});
