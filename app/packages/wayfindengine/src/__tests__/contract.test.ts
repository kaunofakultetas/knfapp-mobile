// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine graph contract
//
//  The sample building through the conformance suite every
//  host graph runs, plus the furniture the sample promises to
//  the tests and examples that lean on it: two levels at
//  0.05 m/px, rooms across the five categories, all three
//  connector kinds with explicit lengths, an exit-only door,
//  codes at the entrance and the stair landings, panoramas
//  with a facing, polygons, and a fresh object per call.
// -----------------------------------------------------------

import { validateGraph } from '../core/graph';
import { describeGraphContract } from '../testing/invariants';
import { sampleBuilding } from '../testing/sampleBuilding';


describeGraphContract('sample building', sampleBuilding);


describe('sampleBuilding — what it promises', () => {
  const graph = sampleBuilding();
  const connectors = graph.edges.filter((edge) => edge.kind === 'stairs' || edge.kind === 'elevator' || edge.kind === 'ramp');

  it('is a fresh object on every call, clean under validateGraph, warnings included', () => {
    expect(sampleBuilding()).not.toBe(graph);
    expect(sampleBuilding()).toEqual(graph);
    expect(validateGraph(graph)).toEqual([]);
  });

  it('has two levels at 0.05 m/px with a viewBox each', () => {
    expect(graph.levels.map((level) => level.id)).toEqual(['L1', 'L2']);
    for (const level of graph.levels) {
      expect(level.metersPerPixel).toBe(0.05);
      expect(level.viewBox).toHaveLength(4);
    }
  });

  it('covers the room categories a nearest-by-category search needs', () => {
    const categories = new Set(graph.rooms.map((room) => room.category));
    for (const category of ['wc', 'exit', 'lecture', 'office', 'food']) expect(categories.has(category)).toBe(true);
    expect(graph.rooms.length).toBeGreaterThanOrEqual(8);
  });

  it('joins the levels by stairs, elevator and ramp, each with an explicit length', () => {
    expect(new Set(connectors.map((edge) => edge.kind))).toEqual(new Set(['stairs', 'elevator', 'ramp']));
    for (const edge of connectors) expect(edge.lengthM).toBeGreaterThan(0);
  });

  it('has an exit-only door, codes at the entrance and the landings, panoramas with a facing, and room outlines', () => {
    expect(graph.edges.filter((edge) => edge.oneWay)).toHaveLength(1);
    const withQr = graph.nodes.filter((node) => node.qr).map((node) => node.id);
    expect(withQr).toEqual(expect.arrayContaining(['n-entrance', 'n-st1', 'n-st2']));
    const withPano = graph.nodes.filter((node) => node.pano);
    expect(withPano.length).toBeGreaterThanOrEqual(3);
    for (const node of withPano) expect(typeof node.panoYaw).toBe('number');
    expect(graph.rooms.filter((room) => room.polygon && room.polygon.length >= 3).length).toBeGreaterThanOrEqual(2);
  });
});
