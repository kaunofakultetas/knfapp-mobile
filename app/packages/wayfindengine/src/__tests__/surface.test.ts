// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine public surface
//
//  The package's runtime exports pinned, plus the three
//  promises hosts lean on without reading a source file: the
//  speed table prices every edge kind, the sample building is
//  clean and routable straight off the barrel, and a printed
//  code round-trips through the anchor pair. Adding is
//  deliberate; removing or renaming is a breaking change for
//  every host and for @knf/wayfinduikit.
// -----------------------------------------------------------

import * as engine from '../index';


describe('@knf/wayfindengine surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(engine).sort()).toEqual(
      [
        'DEFAULT_WALKING_SPEEDS',
        'ELEVATOR_WAIT_S',
        'WayfindProvider',
        'assertRouteInvariants',
        'bearingDeg',
        'buildInstructions',
        'compressPath',
        'createNavigation',
        'describeGraphContract',
        'edgeLengthM',
        'edgeSeconds',
        'findRoute',
        'foldForSearch',
        'formatAnchor',
        'indexGraph',
        'mergeLevels',
        'nearestNode',
        'nearestRoomByCategory',
        'nodeForRoom',
        'parseAnchor',
        'sampleBuilding',
        'searchRooms',
        'shortestArcDeg',
        'svgToGraph',
        'turnBetween',
        'useNavigation',
        'useRoomSearch',
        'useRoute',
        'useWayfind',
        'validateGraph',
      ].sort(),
    );
  });

  it('the speed table prices every edge kind in metres per second', () => {
    const kinds = ['hallway', 'door', 'stairs', 'elevator', 'ramp'] as const;
    expect(Object.keys(engine.DEFAULT_WALKING_SPEEDS).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) expect(engine.DEFAULT_WALKING_SPEEDS[kind]).toBeGreaterThan(0);
  });

  it('the sample building is clean and routes from its entrance off the barrel alone', () => {
    const graph = engine.sampleBuilding();
    expect(engine.validateGraph(graph)).toEqual([]);

    const index = engine.indexGraph(graph);
    const to = engine.nodeForRoom(index, 'r-wc1');
    expect(to).not.toBeNull();
    const { route } = engine.findRoute(index, graph.entranceNodeId as string, to as string);
    expect(route).not.toBeNull();
    engine.assertRouteInvariants(index, route as NonNullable<typeof route>);
    expect(route?.steps[route.steps.length - 1].type).toBe('arrive');
  });

  it('a printed code round-trips through parseAnchor / formatAnchor under the default scheme', () => {
    const anchor = engine.parseAnchor('knf://node/n-st1');
    expect(anchor).toEqual({ kind: 'node', nodeId: 'n-st1' });
    expect(engine.formatAnchor(anchor as NonNullable<typeof anchor>)).toBe('knf://node/n-st1');
    expect(engine.parseAnchor('https://knf.vu.lt')).toBeNull();
  });
});
