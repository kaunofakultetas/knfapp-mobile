// -----------------------------------------------------------
//  [*] timetableengine — layout
//
//  The overlap packer: one day's lessons into clusters, greedy
//  first-fit columns inside each cluster, equal widths across
//  the cluster, rightward span expansion, all emitted as
//  FRACTIONS of the column and of the visible window. This is
//  the compact scheme serious timeline clients converge on;
//  the cascade alternative is their users' top complaint and
//  is deliberately not built.
//
//  Guarantees the tests pin:
//    - back-to-back lessons (end == next start, integer
//      minutes) NEVER share width — strict >= closes clusters;
//    - background blocks (isBlock) never claim columns from
//      real lessons — they place full-width behind;
//    - shuffled input produces identical geometry — the sort
//      is total (start, longer-first, title, id);
//    - vertical fractions measure against the WINDOW, not the
//      24h day — a window that starts at 08:00 puts an 08:00
//      lesson at topFrac 0 (a latent bug class in production
//      clients, designed out here).
//
//  Used by:
//    - hosts placing a day for the UI kit's grid
//    - conflicts.ts — clusters double as conflict candidates
// -----------------------------------------------------------

import type { PlacedEntry, TimeWindow, TimetableEntry } from './types';

export interface PlaceOptions {
  // A lesson shorter than this many minutes is "short" — the
  // UI drops to its compact tier
  shortMin?: number;
}

const DEFAULT_SHORT_MIN = 30;


// Total order: start asc, longer first (containment nests
// stably), then title, then id — the same input set in any
// order yields the same geometry
export function compareEntries(a: TimetableEntry, b: TimetableEntry): number {
  if (a.startMin !== b.startMin) return a.startMin - b.startMin;
  const durA = a.endMin - a.startMin;
  const durB = b.endMin - b.startMin;
  if (durA !== durB) return durB - durA;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}


// Exclusive endpoints: touching is NOT colliding
const collides = (a: TimetableEntry, b: TimetableEntry) => a.endMin > b.startMin && a.startMin < b.endMin;


// One day's entries → placed geometry. Blocks place first,
// full width; lessons cluster and pack
export function placeDay<T = object>(
  dayEntries: readonly TimetableEntry<T>[],
  window: TimeWindow,
  options: PlaceOptions = {},
): PlacedEntry<T>[] {
  const shortMin = options.shortMin ?? DEFAULT_SHORT_MIN;
  const windowSpan = Math.max(1, window.endMin - window.startMin);

  const clampToWindow = (minute: number) => Math.min(Math.max(minute, window.startMin), window.endMin);

  const vertical = (entry: TimetableEntry<T>) => {
    // BOTH ends clamped into the window, so an out-of-window
    // entry renders pinned at the nearer edge (early → topFrac
    // 0, late → topFrac 1, zero height) instead of off canvas
    const top = clampToWindow(entry.startMin);
    const bottom = clampToWindow(entry.endMin);
    return {
      topFrac: (top - window.startMin) / windowSpan,
      heightFrac: Math.max(0, bottom - top) / windowSpan,
    };
  };

  const placed: PlacedEntry<T>[] = [];


  // STEP 1: background blocks — full width, no column claims.
  // Total-sorted like the lessons: paint order (which of two
  // overlapping blocks shows its title) must not depend on
  // input order
  // =========================================================
  for (const entry of dayEntries.filter((candidate) => candidate.isBlock).slice().sort(compareEntries)) {
    placed.push({
      entry,
      layout: {
        clusterId: -1, column: 0, columnCount: 1, span: 1,
        ...vertical(entry), leftFrac: 0, widthFrac: 1,
        isShort: entry.endMin - entry.startMin <= shortMin, isConflict: false,
      },
    });
  }


  // STEP 2: real lessons — total sort, sweep into clusters,
  // greedy first-fit columns, equal widths, rightward span
  // ======================================================
  const lessons = dayEntries.filter((entry) => !entry.isBlock).slice().sort(compareEntries);

  let clusterId = 0;
  let cluster: TimetableEntry<T>[] = [];
  let clusterEnd = -1;
  const columnsOf = new Map<TimetableEntry<T>, number>();

  const flush = () => {
    if (cluster.length === 0) return;

    const columns: TimetableEntry<T>[][] = [];
    for (const entry of cluster) {
      let placedIn = -1;
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1];
        if (!collides(last, entry)) {
          columns[c].push(entry);
          placedIn = c;
          break;
        }
      }
      if (placedIn < 0) {
        columns.push([entry]);
        placedIn = columns.length - 1;
      }
      columnsOf.set(entry, placedIn);
    }

    const count = columns.length;
    for (const entry of cluster) {
      const column = columnsOf.get(entry) as number;
      let spanCols = 1;
      for (let c = column + 1; c < count; c++) {
        if (columns[c].some((other) => collides(other, entry))) break;
        spanCols += 1;
      }
      placed.push({
        entry,
        layout: {
          clusterId, column, columnCount: count, span: spanCols,
          ...vertical(entry),
          leftFrac: column / count,
          widthFrac: spanCols / count,
          isShort: entry.endMin - entry.startMin <= shortMin,
          isConflict: false,
        },
      });
    }

    clusterId += 1;
    cluster = [];
    clusterEnd = -1;
  };

  for (const entry of lessons) {
    // Strict >=: an entry starting exactly at the cluster's end
    // opens a NEW cluster — back-to-back never shares width
    if (cluster.length > 0 && entry.startMin >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMin);
  }
  flush();

  return placed;
}
