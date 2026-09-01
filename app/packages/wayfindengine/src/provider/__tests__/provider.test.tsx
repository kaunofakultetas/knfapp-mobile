// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine provider
//
//  What WayfindProvider promises the hooks beneath it, mounted
//  over the hooks suite's two-level building (an island node
//  gives validateGraph exactly one warning to report). The
//  routing defaults are keyed by content: an inline literal
//  re-created on every render of the provider's parent keeps
//  `env.routing`, the Route and the walker's position, while a
//  literal whose content changes re-identifies all three.
//  Validation runs once per graph object — an inline reporter
//  does not re-run it, a new graph object does — and only with
//  a sink: a release build without `onGraphIssues` does no
//  validation work at all, a release build with one is still
//  reported to, and development without one warns once.
//
//  The graph module is mocked around the real validateGraph so
//  the work itself is countable, not just its report.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { validateGraph } from '../../core/graph';
import type { BuildingGraph, RoutingOptions } from '../../core/types';
import { useNavigation } from '../../hooks/useNavigation';
import { useRoute } from '../../hooks/useRoute';
import { WayfindProvider, useWayfind } from '..';


jest.mock('../../core/graph', () => {
  const actual = jest.requireActual('../../core/graph');
  return { ...actual, validateGraph: jest.fn(actual.validateGraph) };
});

const mockValidateGraph = validateGraph as jest.MockedFunction<typeof validateGraph>;


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
  ],
  entranceNodeId: 'a',
};

const island = [expect.objectContaining({ code: 'unreachable_node', ref: 'x' })];

// A walker under the provider: the route from the entrance to
// the upstairs door and a cursor over it
const useWalker = () => {
  const { route } = useRoute('a', 'e');
  const nav = useNavigation(route);
  return { route, nav, routing: useWayfind().routing };
};

const devFlag = globalThis as { __DEV__?: boolean };
const withRelease = async (run: () => Promise<void>) => {
  const before = devFlag.__DEV__;
  devFlag.__DEV__ = false;
  try {
    await run();
  } finally {
    devFlag.__DEV__ = before;
  }
};

beforeEach(() => {
  mockValidateGraph.mockClear();
});


describe('WayfindProvider — routing keyed by content', () => {
  it('an inline routing literal keeps env.routing, the Route and the walker across parent re-renders', async () => {
    // The wrapper re-renders with the hook, and the literal is
    // a new object every time
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WayfindProvider graph={graph} routing={{ avoid: ['elevator'], walkingSpeeds: { hallway: 1.2 } }} onGraphIssues={() => {}}>
        {children}
      </WayfindProvider>
    );
    const h = await renderHook(({ n }: { n: number }) => ({ n, ...useWalker() }), { wrapper, initialProps: { n: 0 } });
    const first = h.result.current;
    expect(first.route).not.toBeNull();

    await act(async () => h.result.current.nav.next());
    await act(async () => h.result.current.nav.next());
    await act(async () => h.result.current.nav.next());
    expect(h.result.current.nav.state?.index).toBe(3);

    await h.rerender({ n: 1 });
    expect(h.result.current.n).toBe(1);
    expect(h.result.current.routing).toBe(first.routing);
    expect(h.result.current.route).toBe(first.route);
    expect(h.result.current.nav.state?.index).toBe(3);
  });

  it('two literals spelling the same options in another order share one env.routing', async () => {
    let flip: ((n: number) => void) | null = null;
    const Wrapper = ({ children }: { children: ReactNode }) => {
      const [n, setN] = useState(0);
      flip = setN;
      const routing: RoutingOptions = n % 2 === 0 ? { avoid: ['elevator'], walkingSpeeds: { hallway: 1, stairs: 1 } } : { walkingSpeeds: { stairs: 1, hallway: 1 }, avoid: ['elevator'] };
      return (
        <WayfindProvider graph={graph} routing={routing} onGraphIssues={() => {}}>
          {children}
        </WayfindProvider>
      );
    };
    const h = await renderHook(() => useWalker(), { wrapper: Wrapper });
    const first = h.result.current;

    await act(async () => flip?.(1));
    expect(h.result.current.routing).toBe(first.routing);
    expect(h.result.current.route).toBe(first.route);
  });

  it('a literal whose content changes re-identifies env.routing and the route', async () => {
    let choose: ((avoid: 'elevator' | 'stairs') => void) | null = null;
    const Wrapper = ({ children }: { children: ReactNode }) => {
      const [avoid, setAvoid] = useState<'elevator' | 'stairs'>('elevator');
      choose = setAvoid;
      return (
        <WayfindProvider graph={graph} routing={{ avoid: [avoid] }} onGraphIssues={() => {}}>
          {children}
        </WayfindProvider>
      );
    };
    const h = await renderHook(() => useWalker(), { wrapper: Wrapper });
    const first = h.result.current;
    expect(first.route).not.toBeNull();

    // The stairs are the only way up
    await act(async () => choose?.('stairs'));
    expect(h.result.current.routing).not.toBe(first.routing);
    expect(h.result.current.routing).toEqual({ avoid: ['stairs'] });
    expect(h.result.current.route).toBeNull();
  });
});


describe('WayfindProvider — validation once per graph object', () => {
  it('an inline onGraphIssues is reported to once, however often the parent re-renders', async () => {
    const sink = jest.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WayfindProvider graph={graph} onGraphIssues={(issues) => sink(issues)}>
        {children}
      </WayfindProvider>
    );
    const h = await renderHook(({ n }: { n: number }) => n, { wrapper, initialProps: { n: 0 } });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenLastCalledWith(island);

    await h.rerender({ n: 1 });
    await h.rerender({ n: 2 });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(mockValidateGraph).toHaveBeenCalledTimes(1);
  });

  it('a new graph object is validated and reported again', async () => {
    const sink = jest.fn();
    let swap: (() => void) | null = null;
    const Wrapper = ({ children }: { children: ReactNode }) => {
      const [g, setG] = useState(graph);
      swap = () => setG({ ...graph });
      return (
        <WayfindProvider graph={g} onGraphIssues={(issues) => sink(issues)}>
          {children}
        </WayfindProvider>
      );
    };
    await renderHook(() => useWayfind().graph, { wrapper: Wrapper });
    expect(sink).toHaveBeenCalledTimes(1);

    await act(async () => swap?.());
    expect(sink).toHaveBeenCalledTimes(2);
    expect(mockValidateGraph).toHaveBeenCalledTimes(2);
  });

  it('development without a reporter warns once', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const wrapper = ({ children }: { children: ReactNode }) => <WayfindProvider graph={graph}>{children}</WayfindProvider>;
      const h = await renderHook(({ n }: { n: number }) => n, { wrapper, initialProps: { n: 0 } });
      await h.rerender({ n: 1 });
      expect(mockValidateGraph).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/1 graph issue/);
    } finally {
      warn.mockRestore();
    }
  });

  it('a release build without a reporter does no validation work', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await withRelease(async () => {
        const wrapper = ({ children }: { children: ReactNode }) => <WayfindProvider graph={graph}>{children}</WayfindProvider>;
        const h = await renderHook(({ n }: { n: number }) => n, { wrapper, initialProps: { n: 0 } });
        await h.rerender({ n: 1 });
      });
      expect(mockValidateGraph).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('a release build with a reporter is still reported to, once', async () => {
    const sink = jest.fn();
    await withRelease(async () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WayfindProvider graph={graph} onGraphIssues={(issues) => sink(issues)}>
          {children}
        </WayfindProvider>
      );
      const h = await renderHook(({ n }: { n: number }) => n, { wrapper, initialProps: { n: 0 } });
      await h.rerender({ n: 1 });
    });
    expect(mockValidateGraph).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenLastCalledWith(island);
  });
});
