// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine hooks
//
//  The three hooks mounted under WayfindProvider over one
//  inline two-level building. useRoute: idle on a null
//  endpoint, a route, the router's two reasons, the provider's
//  options as defaults under the call's (walkingSpeeds merging
//  one level deeper), and one Route object held across
//  renders of the same inputs (an inline literal spelt in
//  another field order included). useNavigation: every move
//  re-renders the state, an off-route snap changes nothing,
//  steps become metres through the provider's stride, a new
//  route resets the cursor and a null route is inert.
//  useRoomSearch: matches, floor sections in floor order and
//  the count.
//
//  Modules are imported directly (not through the barrel) so
//  this suite runs before the package's other files exist.
//
//  The plan (1 m per pixel): L1 a (0,0) → b (10,0) → c (20,0)
//  stairs; L2 d (20,0) → e (30,0), room R2's door. R1 at a.
//  x is an island; 4 m of stairs; 34 m in all.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { indexGraph } from '../../core/graph';
import { findRoute } from '../../core/route';
import type { BuildingGraph, Route, RoutingOptions } from '../../core/types';
import { WayfindProvider } from '../../provider';
import { useNavigation } from '../useNavigation';
import { useRoomSearch } from '../useRoomSearch';
import { useRoute } from '../useRoute';


const graph: BuildingGraph = {
  version: 1,
  building: 'test',
  levels: [
    { id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 1 },
    { id: 'L2', label: '2', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 2 },
  ],
  nodes: [
    { id: 'a', level: 'L1', x: 0, y: 0, kind: 'entrance' },
    { id: 'b', level: 'L1', x: 10, y: 0, kind: 'corridor' },
    { id: 'c', level: 'L1', x: 20, y: 0, kind: 'stairs' },
    { id: 'd', level: 'L2', x: 20, y: 0, kind: 'stairs' },
    { id: 'e', level: 'L2', x: 30, y: 0, kind: 'door' },
    { id: 'x', level: 'L1', x: 90, y: 90, kind: 'corridor' },
  ],
  edges: [
    { a: 'a', b: 'b', kind: 'hallway' },
    { a: 'b', b: 'c', kind: 'hallway' },
    { a: 'c', b: 'd', kind: 'stairs', lengthM: 4 },
    { a: 'd', b: 'e', kind: 'hallway' },
  ],
  rooms: [
    { id: 'R1', name: 'Aula', level: 'L1', nodeId: 'a' },
    { id: 'R2', name: 'Auditorija 201', level: 'L2', nodeId: 'e' },
    { id: 'R3', name: 'Auditorija 102', level: 'L1', nodeId: 'b' },
  ],
  entranceNodeId: 'a',
};

const index = indexGraph(graph);

// The island is a deliberate validation warning; it must not
// reach the console
const makeWrapper = (routing?: RoutingOptions, strideM?: number) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WayfindProvider graph={graph} routing={routing} strideM={strideM} onGraphIssues={() => {}}>
        {children}
      </WayfindProvider>
    );
  };
};

const visited = (route: Route | null): string[] => (route ? route.points.map((p) => p.nodeId) : []);


describe('useRoute', () => {
  it('is idle while an endpoint is missing', async () => {
    const h = await renderHook(({ from, to }: { from: string | null; to: string | null }) => useRoute(from, to), {
      wrapper: makeWrapper(),
      initialProps: { from: null, to: 'e' },
    });
    expect(h.result.current).toEqual({ route: null, reason: 'idle' });

    await h.rerender({ from: 'a', to: null });
    expect(h.result.current).toEqual({ route: null, reason: 'idle' });
  });

  it('answers the route between two known nodes', async () => {
    const h = await renderHook(() => useRoute('a', 'e'), { wrapper: makeWrapper() });
    expect(h.result.current.reason).toBeNull();
    expect(visited(h.result.current.route)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(h.result.current.route?.distanceM).toBe(34);
  });

  it("passes the router's reasons through", async () => {
    const h = await renderHook(({ to }: { to: string }) => useRoute('a', to), { wrapper: makeWrapper(), initialProps: { to: 'x' } });
    expect(h.result.current).toEqual({ route: null, reason: 'no_path' });

    await h.rerender({ to: 'nope' });
    expect(h.result.current).toEqual({ route: null, reason: 'unknown_node' });
  });

  it("uses the provider's options as defaults under the call's", async () => {
    // The provider refuses stairs; the only way up is stairs
    const wrapper = makeWrapper({ accessibility: 'accessible' });
    const byDefault = await renderHook(() => useRoute('a', 'e'), { wrapper });
    expect(byDefault.result.current.reason).toBe('no_path');

    const overridden = await renderHook(() => useRoute('a', 'e', { accessibility: 'shortest' }), { wrapper });
    expect(visited(overridden.result.current.route)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it("merges walkingSpeeds one level deeper than the call's object", async () => {
    // Provider: hallways at 1 m/s; call: stairs at 1 m/s. Both
    // must hold — 30 m of hallway + 4 m of stairs = 34 s
    const wrapper = makeWrapper({ walkingSpeeds: { hallway: 1 } });
    const h = await renderHook(() => useRoute('a', 'e', { walkingSpeeds: { stairs: 1 } }), { wrapper });
    expect(h.result.current.route?.etaSeconds).toBe(34);
  });

  it('holds one Route object across renders of the same inputs', async () => {
    // An inline options literal is a new object every render
    const h = await renderHook(({ n }: { n: number }) => [n, useRoute('a', 'e', { minimizeFloorChanges: true })] as const, {
      wrapper: makeWrapper(),
      initialProps: { n: 0 },
    });
    const first = h.result.current[1].route;
    expect(first).not.toBeNull();

    await h.rerender({ n: 1 });
    expect(h.result.current[0]).toBe(1);
    expect(h.result.current[1].route).toBe(first);
  });

  it('keys an inline options literal by content — field order, the avoid list and the speed table included', async () => {
    // The same options spelt in another order are the same
    // options; only the content of a field changes the key
    const spell = (n: number): RoutingOptions =>
      n % 2 === 0 ? { avoid: ['elevator'], walkingSpeeds: { hallway: 1, stairs: 1 } } : { walkingSpeeds: { stairs: 1, hallway: 1 }, avoid: ['elevator'] };
    const h = await renderHook(({ n }: { n: number }) => useRoute('a', 'e', spell(n)), { wrapper: makeWrapper(), initialProps: { n: 0 } });
    const first = h.result.current.route;
    expect(first?.etaSeconds).toBe(34);

    await h.rerender({ n: 1 });
    expect(h.result.current.route).toBe(first);

    await h.rerender({ n: 2 });
    expect(h.result.current.route).toBe(first);
  });

  it('a changed option re-runs the search', async () => {
    const h = await renderHook(({ options }: { options: RoutingOptions }) => useRoute('a', 'e', options), {
      wrapper: makeWrapper(),
      initialProps: { options: {} },
    });
    const first = h.result.current.route;

    await h.rerender({ options: { walkingSpeeds: { stairs: 1 } } });
    expect(h.result.current.route).not.toBe(first);
    expect(h.result.current.route?.etaSeconds).not.toBe(first?.etaSeconds);
  });
});


describe('useNavigation', () => {
  const route = findRoute(index, 'a', 'e').route as Route;
  const shorter = findRoute(index, 'b', 'e').route as Route;

  it('starts at the first point and re-renders on every move', async () => {
    const h = await renderHook(() => useNavigation(route), { wrapper: makeWrapper() });
    expect(h.result.current.state?.index).toBe(0);
    expect(h.result.current.state?.currentNodeId).toBe('a');
    const initial = h.result.current.state;

    await act(async () => h.result.current.next());
    expect(h.result.current.state?.index).toBe(1);
    expect(h.result.current.state?.currentNodeId).toBe('b');
    expect(h.result.current.state).not.toBe(initial);

    await act(async () => h.result.current.back());
    expect(h.result.current.state?.index).toBe(0);

    await act(async () => h.result.current.jumpTo(4));
    expect(h.result.current.state?.arrived).toBe(true);
    expect(h.result.current.state?.currentLevel).toBe('L2');

    await act(async () => h.result.current.reset());
    expect(h.result.current.state?.index).toBe(0);
    expect(h.result.current.state?.progressM).toBe(0);
  });

  it('snaps to a node on the route and ignores one off it', async () => {
    const h = await renderHook(() => useNavigation(route), { wrapper: makeWrapper() });

    let answer: 'on-route' | 'off-route' = 'off-route';
    await act(async () => {
      answer = h.result.current.snapTo('c');
    });
    expect(answer).toBe('on-route');
    expect(h.result.current.state?.index).toBe(2);
    const placed = h.result.current.state;

    await act(async () => {
      answer = h.result.current.snapTo('x');
    });
    expect(answer).toBe('off-route');
    expect(h.result.current.state).toBe(placed);
  });

  it("turns steps into metres through the provider's stride", async () => {
    // 0.5 m per step: 19 steps is 9.5 m, short of b at 10 m;
    // one more reaches it, and the overshoot carries on
    const h = await renderHook(() => useNavigation(route), { wrapper: makeWrapper(undefined, 0.5) });

    await act(async () => h.result.current.advanceBySteps(19));
    expect(h.result.current.state?.index).toBe(0);

    await act(async () => h.result.current.advanceBySteps(1));
    expect(h.result.current.state?.index).toBe(1);

    await act(async () => h.result.current.advanceBySteps(28));
    expect(h.result.current.state?.index).toBe(3);
    expect(h.result.current.state?.currentNodeId).toBe('d');

    await act(async () => h.result.current.advanceByDistance(10));
    expect(h.result.current.state?.arrived).toBe(true);
  });

  it('resets on a new route and keeps its cursor for the same one', async () => {
    const h = await renderHook(({ r }: { r: Route | null }) => useNavigation(r), { wrapper: makeWrapper(), initialProps: { r: route } });

    await act(async () => h.result.current.next());
    expect(h.result.current.state?.index).toBe(1);

    // Same route object: the cursor stays
    await h.rerender({ r: route });
    expect(h.result.current.state?.index).toBe(1);

    // A different route: back to its first point
    await h.rerender({ r: shorter });
    expect(h.result.current.state?.index).toBe(0);
    expect(h.result.current.state?.currentNodeId).toBe('b');
    expect(h.result.current.state?.remainingM).toBe(24);
  });

  it('is inert without a route', async () => {
    const h = await renderHook(({ r }: { r: Route | null }) => useNavigation(r), { wrapper: makeWrapper(), initialProps: { r: null } });
    expect(h.result.current.state).toBeNull();

    let answer: 'on-route' | 'off-route' = 'on-route';
    await act(async () => {
      h.result.current.next();
      h.result.current.advanceBySteps(100);
      answer = h.result.current.snapTo('a');
    });
    expect(answer).toBe('off-route');
    expect(h.result.current.state).toBeNull();

    // A route arriving later starts a walk
    await h.rerender({ r: route });
    expect(h.result.current.state?.currentNodeId).toBe('a');
  });
});


describe('useRoomSearch', () => {
  it('sections the browse list by floor, lowest first', async () => {
    const h = await renderHook(() => useRoomSearch(''), { wrapper: makeWrapper() });
    expect(h.result.current.count).toBe(3);
    expect(h.result.current.matches.map((m) => m.room.id)).toEqual(['R3', 'R1', 'R2']);
    expect(h.result.current.grouped.map((g) => [g.level.id, g.matches.map((m) => m.room.id)])).toEqual([
      ['L1', ['R3', 'R1']],
      ['L2', ['R2']],
    ]);
  });

  it('keeps only the floors with a match', async () => {
    const h = await renderHook(({ q }: { q: string }) => useRoomSearch(q), { wrapper: makeWrapper(), initialProps: { q: 'aula' } });
    expect(h.result.current.count).toBe(1);
    expect(h.result.current.grouped.map((g) => g.level.id)).toEqual(['L1']);

    await h.rerender({ q: 'aud' });
    expect(h.result.current.count).toBe(2);
    expect(h.result.current.grouped.map((g) => [g.level.id, g.matches.map((m) => m.room.id)])).toEqual([
      ['L1', ['R3']],
      ['L2', ['R2']],
    ]);

    await h.rerender({ q: 'zzz' });
    expect(h.result.current).toEqual({ matches: [], grouped: [], count: 0 });
  });

  it('passes limit and localize through', async () => {
    const localize = (room: { id: string; name: string }) => (room.id === 'R1' ? 'Salė' : room.name);
    const h = await renderHook(() => useRoomSearch('sale', { localize, limit: 5 }), { wrapper: makeWrapper() });
    expect(h.result.current.matches.map((m) => m.room.id)).toEqual(['R1']);

    const capped = await renderHook(() => useRoomSearch('', { limit: 2 }), { wrapper: makeWrapper() });
    expect(capped.result.current.count).toBe(2);
  });

  it('holds one result across renders of the same query', async () => {
    const h = await renderHook(({ n }: { n: number }) => [n, useRoomSearch('aud')] as const, { wrapper: makeWrapper(), initialProps: { n: 0 } });
    const first = h.result.current[1];

    await h.rerender({ n: 1 });
    expect(h.result.current[1]).toBe(first);
  });
});
