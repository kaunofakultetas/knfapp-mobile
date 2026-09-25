// -----------------------------------------------------------
//  [*] Tests — one stamp rule, two copies
//
//  chatengine (core/time.ts) and chatuikit (core/timeline.ts)
//  each carry the backend's zoneless-UTC stamp rule — the
//  packages stay import-free of each other on purpose. The
//  copies once drifted: the kit cut the wire's microsecond
//  fraction to milliseconds, the engine did not. This pins
//  both to the same NORMALIZED STRING for every shape the
//  wire sends — engine-independent, unlike a parsed Date
//  (Node reads six fraction digits either way, so a Date
//  comparison could never have caught the drift).
// -----------------------------------------------------------

import { normalizeStamp as engineNormalize, parseStamp as engineParse } from '@knf/chatengine/core/time';
import { normalizeStamp as kitNormalize, parseStamp as kitParse } from '@knf/chatuikit/core/timeline';


// Every stamp shape the wire (and SQLite) produces, with the
// one normalized string both copies must answer
const WIRE_SHAPES: [string, string][] = [
  // What the chat routes actually emit: naive UTC, microseconds
  ['2026-09-19T17:50:28.149882', '2026-09-19T17:50:28.149Z'],
  ['2026-09-19T17:50:28.149', '2026-09-19T17:50:28.149Z'],
  ['2026-09-19T17:50:28', '2026-09-19T17:50:28Z'],
  ['2026-09-19T17:50', '2026-09-19T17:50Z'],
  // SQLite's space form
  ['2026-09-19 17:50:28.149882', '2026-09-19T17:50:28.149Z'],
  // Zoned forms pass through, fraction still cut
  ['2026-09-19T17:50:28.149882Z', '2026-09-19T17:50:28.149Z'],
  ['2026-09-19T17:50:28.149882+00:00', '2026-09-19T17:50:28.149+00:00'],
  ['2026-09-19T17:50:28.1Z', '2026-09-19T17:50:28.1Z'],
  ['2026-09-19T17:50:28.123456789Z', '2026-09-19T17:50:28.123Z'],
];


describe('the zoneless-UTC stamp rule', () => {
  it.each(WIRE_SHAPES)('%s normalizes identically in both packages', (wire, expected) => {
    expect(engineNormalize(wire)).toBe(expected);
    expect(kitNormalize(wire)).toBe(expected);
  });

  it('both parsers land on the same instant for every wire shape', () => {
    for (const [wire] of WIRE_SHAPES) {
      expect(engineParse(wire)?.getTime()).toBe(kitParse(wire)?.getTime());
    }
  });

  it('garbage is null in the engine, never an Invalid Date', () => {
    expect(engineParse('ne data')).toBeNull();
    expect(engineParse('')).toBeNull();
    expect(engineParse(null)).toBeNull();
    expect(kitParse('ne data')).toBeNull();
  });
});
