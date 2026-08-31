// -----------------------------------------------------------
//  [*] Tests — the timeline against the classic breakage
//
//  Scenarios every production chat client eventually ships a
//  fix for: the midnight boundary (a run must never span two
//  days), same-second ties keeping their server order, a
//  garbage timestamp rendering instead of crashing, and the
//  exact run/separator gap boundaries.
// -----------------------------------------------------------

import { GROUP_GAP_MS, SEPARATOR_GAP_MS, buildTimeline } from '../timeline';
import type { KitMessage } from '../types';

const labels = { today: 'Today', yesterday: 'Yesterday', locale: 'lt' };
const at = (iso: string, id: string, over: Partial<KitMessage> = {}): KitMessage => ({
  id, senderId: 'u2', senderName: 'Ona', text: id, createdAt: iso, isOwn: false, status: 'read', reactions: [], ...over,
});

// buildTimeline takes NEWEST first, like the list
const rows = (items: TimelineReturn) => items.filter((r) => r.type === 'message');
const seps = (items: TimelineReturn) => items.filter((r) => r.type === 'separator');
type TimelineReturn = ReturnType<typeof buildTimeline>;

describe('timeline hardening', () => {
  it('breaks a run at midnight even two minutes apart', () => {
    const items = buildTimeline([at('2026-08-28T00:01:00Z', 'after'), at('2026-08-27T23:59:00Z', 'before')], labels);
    expect(seps(items)).toHaveLength(2);
    const positions = rows(items).map((r) => (r as { type: 'message'; position: string }).position);
    expect(positions).toEqual(['single', 'single']);
  });

  it('keeps the server order on same-second ties', () => {
    const items = buildTimeline(
      [at('2026-08-27T10:00:00Z', 'b'), at('2026-08-27T10:00:00Z', 'a')],
      labels,
    );
    expect(rows(items).map((r) => (r as { message: KitMessage }).message.id)).toEqual(['b', 'a']);
  });

  it('renders a garbage timestamp instead of crashing', () => {
    const items = buildTimeline([at('not-a-date', 'weird'), at('2026-08-27T10:00:00Z', 'fine')], labels);
    expect(rows(items)).toHaveLength(2);
  });

  it('honours the exact run and separator boundaries', () => {
    const base = Date.UTC(2026, 7, 27, 10, 0, 0);
    const iso = (ms: number) => new Date(base + ms).toISOString();
    // Inside the run gap: one run
    const grouped = buildTimeline([at(iso(GROUP_GAP_MS - 1000), 'b'), at(iso(0), 'a')], labels);
    expect(rows(grouped).map((r) => (r as { position: string }).position)).toEqual(['last', 'first']);
    // Beyond it: two runs, still one separator (the head's)
    const split = buildTimeline([at(iso(GROUP_GAP_MS + 1000), 'b'), at(iso(0), 'a')], labels);
    expect(rows(split).map((r) => (r as { position: string }).position)).toEqual(['single', 'single']);
    expect(seps(split)).toHaveLength(1);
    // Beyond the stamp-worthy silence: a second separator
    const stamped = buildTimeline([at(iso(SEPARATOR_GAP_MS + 1000), 'b'), at(iso(0), 'a')], labels);
    expect(seps(stamped)).toHaveLength(2);
  });

  it('a new head leaves deep history untouched: keys and positions stable', () => {
    const base = Date.UTC(2026, 7, 27, 10, 0, 0);
    const iso = (ms: number) => new Date(base + ms).toISOString();
    // Two closed runs an hour apart, then a fresh head arrives
    const history = [at(iso(2 * SEPARATOR_GAP_MS), 'c'), at(iso(SEPARATOR_GAP_MS), 'b'), at(iso(0), 'a')];
    const before = buildTimeline(history, labels);
    // The head opens its OWN run — a head joining the newest run
    // legitimately reshapes that run's positions
    const after = buildTimeline([at(iso(2 * SEPARATOR_GAP_MS + GROUP_GAP_MS + 1000), 'd'), ...history], labels);
    // Everything below the new head keeps its key and its shape —
    // FlatList identity is what stops deep re-renders
    const tail = (items: TimelineReturn) => items.filter((r) => !(r.type === 'message' && (r as { message: KitMessage }).message.id === 'd'));
    expect(tail(after).map((r) => r.key)).toEqual(before.map((r) => r.key));
    expect(
      tail(after).filter((r) => r.type === 'message').map((r) => (r as { position: string }).position),
    ).toEqual(before.filter((r) => r.type === 'message').map((r) => (r as { position: string }).position));
  });
});
