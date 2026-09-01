// -----------------------------------------------------------
//  [*] wayfindengine — provider
//
//  The one context every hook reads: the building graph (with
//  its memoised index), the default routing options, and the
//  walking assumptions (stride length for the pedometer nudge,
//  walking speeds per edge kind for the ETA). The engine is
//  fully functional with only a graph — everything else has a
//  default.
//
//  The routing defaults are keyed by CONTENT, not identity: a
//  screen may write the literal inline and re-render as often
//  as it likes, and `env.routing` stays the same object until
//  a field actually changes. Every hook memoises on it, and a
//  fresh object would hand useRoute a fresh Route, which
//  restarts the walker beneath it on a render that changed
//  nothing. useRoute keys the call's own options through the
//  same serialisation.
//
//  Validation runs once per graph object, and only when
//  somebody will hear the result: in development, where the
//  findings fall back to console.warn, or whenever
//  `onGraphIssues` is given (a release build with a reporter
//  still gets its findings). A release build without one skips
//  the walk entirely — a dangling edge found at boot beats a
//  route that silently fails in the building, but a report
//  nobody reads is only work.
//
//  Used by:
//    - every hook in the package
// -----------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { indexGraph, validateGraph, type GraphIndex, type GraphIssue } from '../core/graph';
import type { BuildingGraph, EdgeKind, RoutingOptions } from '../core/types';


export interface WayfindEnv {
  graph: BuildingGraph;
  index: GraphIndex;
  routing: RoutingOptions;
  // Metres per step for the pedometer auto-advance nudge
  strideM: number;
}

const WayfindContext = createContext<WayfindEnv | null>(null);







// -----------------------------------------------------------
// routingKey
// -----------------------------------------------------------
//
// RoutingOptions is plain data (a mode, a flag, a list, a
// number table), so a serialisation is its identity — but only
// a canonical one: the fields go out in a fixed order, the
// avoid list and the speed table's kinds sorted, so two
// literals that spell the same options differently share a
// key. The key parses back into the options, so a memo may
// rebuild them from the key alone and depend on exactly what
// it uses.
//
// Used by:
//   - WayfindProvider (below) — the building-wide defaults
//   - hooks/useRoute.ts — the call's options
// -----------------------------------------------------------

export function routingKey(options: RoutingOptions | null | undefined): string {

  if (!options) return 'null';
  const canonical: RoutingOptions = {};
  if (options.accessibility !== undefined) canonical.accessibility = options.accessibility;
  if (options.minimizeFloorChanges !== undefined) canonical.minimizeFloorChanges = options.minimizeFloorChanges;
  if (options.avoid !== undefined) canonical.avoid = [...options.avoid].sort();


  if (options.walkingSpeeds !== undefined) {
    const speeds = options.walkingSpeeds;
    const sorted: Partial<Record<EdgeKind, number>> = {};
    for (const kind of (Object.keys(speeds) as EdgeKind[]).sort()) sorted[kind] = speeds[kind];
    canonical.walkingSpeeds = sorted;
  }
  return JSON.stringify(canonical);
}







// -----------------------------------------------------------
// WayfindProvider
// -----------------------------------------------------------
//
// Used by:
//   - the host app's map screen (or its layout)
//   - every test that mounts a hook
// -----------------------------------------------------------

export function WayfindProvider({
  graph,
  routing,
  strideM = 0.7,
  onGraphIssues,
  children,
}: {
  graph: BuildingGraph;
  routing?: RoutingOptions;
  strideM?: number;
  // Receives validation issues once per graph object, in every
  // build; omitted, the graph is validated in development only
  // and the issues go to console.warn
  onGraphIssues?: (issues: GraphIssue[]) => void;
  children: ReactNode;
}) {

  // The defaults live as long as their content does
  const key = routingKey(routing);
  const stableRouting = useMemo<RoutingOptions>(() => JSON.parse(key) ?? {}, [key]);
  const env = useMemo<WayfindEnv>(
    () => ({ graph, index: indexGraph(graph), routing: stableRouting, strideM }),
    [graph, stableRouting, strideM],
  );


  // The reporter rides in a ref so a host passing an inline
  // closure re-runs nothing: the validation effect keys on the
  // graph alone, which is what "once per graph object" means
  const sinkRef = useRef(onGraphIssues);
  useEffect(() => {
    sinkRef.current = onGraphIssues;
  });


  useEffect(() => {
    // No reporter outside development means nobody would read
    // the findings, so the walk is not made
    const sink = sinkRef.current;
    if (!sink && !__DEV__) return;
    const issues = validateGraph(graph);
    if (issues.length === 0) return;
    if (sink) sink(issues);
    else console.warn(`[wayfindengine] ${issues.length} graph issue(s):`, issues.map((i) => `${i.severity} ${i.code} ${i.ref}: ${i.message}`).join('\n'));
  }, [graph]);


  return <WayfindContext.Provider value={env}>{children}</WayfindContext.Provider>;
}







// -----------------------------------------------------------
// useWayfind
// -----------------------------------------------------------
//
// Used by:
//   - every hook in the package
// -----------------------------------------------------------

export function useWayfind(): WayfindEnv {
  const env = useContext(WayfindContext);
  if (!env) throw new Error('useWayfind must be used inside <WayfindProvider>');
  return env;
}
