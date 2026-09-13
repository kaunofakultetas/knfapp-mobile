// -----------------------------------------------------------
//  [*] chatengine — time
//
//  parseStamp: the one stamp parser. Backends disagree on what
//  "ISO" means — the engine accepts a zone suffix (Z, ±hh:mm),
//  reads a bare stamp as UTC (the common "naive UTC" shape),
//  and answers null instead of an Invalid Date for anything
//  else, so ordering code can treat null as "unknown".
//  Deliberately import-free: chatuikit ships its own copy of
//  parseStamp (core/timeline.ts), so a behavior change here
//  wants a matching edit there.
//
//  Used by:
//    - core/reducers.ts — the resync merge sort
// -----------------------------------------------------------







// -----------------------------------------------------------
// parseStamp
// -----------------------------------------------------------
//
// Used by:
//   - core/reducers.ts — orders merged pages by stamp
//   - hosts via the package surface (chatuikit ships its own
//     copy for timeline labels)
// -----------------------------------------------------------

export function parseStamp(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  // A bare "YYYY-MM-DDTHH:MM:SS(.ffffff)" is UTC; a space
  // separator is tolerated
  const bare = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
  const candidate = bare.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}







// -----------------------------------------------------------
// stampMs
// -----------------------------------------------------------
//
// The sortable form: milliseconds, with unknown stamps reading
// as 0 so they sink to the oldest end instead of throwing.
//
// Used by:
//   - core/reducers.ts — page merges and the newest-stamp cut
// -----------------------------------------------------------

export const stampMs = (iso: string | null | undefined): number => parseStamp(iso)?.getTime() ?? 0;
