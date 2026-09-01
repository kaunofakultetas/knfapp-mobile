// -----------------------------------------------------------
//  [*] wayfindengine — useRoomSearch
//
//  The destination picker's list for one query, memoised per
//  keystroke: the ranked matches, the same matches sectioned
//  by floor for a list with headers, and the count for the
//  "N rooms" line. Sections follow the building's floor order
//  (lowest first) whatever the query — a person scanning a
//  sectioned list expects floors in order, and the rank still
//  shows inside each section, where the matches keep their
//  score order.
//
//  `localize` and `limit` are the search's own options passed
//  through; a localizer that changes identity every render
//  re-runs the search every render, so hosts hand in a stable
//  one (the translation function itself, or a useCallback).
//
//  Used by:
//    - src/index.ts — public surface; the host's map screen
//      destination list
// -----------------------------------------------------------

import { useMemo } from 'react';

import { searchRooms, type RoomMatch, type SearchRoomsOptions } from '../core/search';
import type { Level } from '../core/types';
import { useWayfind } from '../provider';


export interface UseRoomSearchResult {
  matches: RoomMatch[];
  grouped: { level: Level; matches: RoomMatch[] }[];
  count: number;
}







// -----------------------------------------------------------
// useRoomSearch
// -----------------------------------------------------------
//
//   const { matches, grouped, count } = useRoomSearch(query)
//   useRoomSearch(query, { localize: (r) => t(r.nameKey ?? r.name), limit: 50 })
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function useRoomSearch(query: string, options: SearchRoomsOptions = {}): UseRoomSearchResult {

  const env = useWayfind();
  const { localize, limit } = options;


  return useMemo<UseRoomSearchResult>(() => {
    const matches = searchRooms(env.index, query, { localize, limit });


    // Sections in floor order; a floor with no match has no
    // section, and a match's own level (not a lookup) names it
    const byLevel = new Map<string, RoomMatch[]>();
    for (const match of matches) byLevel.set(match.level.id, [...(byLevel.get(match.level.id) ?? []), match]);
    const grouped: UseRoomSearchResult['grouped'] = [];
    for (const level of env.index.orderedLevels) {
      const section = byLevel.get(level.id);
      if (section) grouped.push({ level, matches: section });
    }


    return { matches, grouped, count: matches.length };
  }, [env.index, query, localize, limit]);
}
