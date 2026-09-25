// -----------------------------------------------------------
//  [*] chatengine — time
//
//  parseStamp: the one stamp parser. Backends disagree on what
//  "ISO" means — the engine accepts a zone suffix (Z, ±hh:mm),
//  reads a bare stamp as UTC (the common "naive UTC" shape),
//  cuts a longer fraction to milliseconds (the KNF wire sends
//  microseconds; the JS Date grammar only promises three
//  digits, so the stamp is normalized before any engine sees
//  it), and answers null instead of an Invalid Date for
//  anything else, so ordering code can treat null as
//  "unknown". Deliberately import-free: chatuikit ships its
//  own copy of the rule (core/timeline.ts normalizeStamp), so
//  a behavior change here wants a matching edit there — the
//  app's __tests__/stampParity.test.ts holds the two to the
//  same normalized STRING for every wire shape.
//
//  Used by:
//    - core/reducers.ts — the resync merge sort
//    - hooks/useConversation.ts, hooks/usePins.ts — expiry
// -----------------------------------------------------------







// -----------------------------------------------------------
// normalizeStamp
// -----------------------------------------------------------
//
//   normalizeStamp('2026-09-19T17:50:28.149882')
//     → '2026-09-19T17:50:28.149Z'
//
// The stamp string parseStamp hands to Date: trimmed, a space
// separator turned into T, a bare stamp given its UTC Z, and a
// fraction past three digits cut to milliseconds — or null for
// a blank / non-string value. Exported (from this module only,
// not the package surface) so tests can pin the normalized
// STRING, which is engine-independent where a parsed Date is
// not.
//
// Used by:
//   - parseStamp (below)
//   - __tests__ — the stamp rule, byte for byte
// -----------------------------------------------------------

export function normalizeStamp(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  // A bare "YYYY-MM-DDTHH:MM:SS(.ffffff)" is UTC; a space
  // separator is tolerated
  const bare = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
  const candidate = bare.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
  return candidate.replace(/(\.\d{3})\d+/, '$1');
}







// -----------------------------------------------------------
// parseStamp
// -----------------------------------------------------------
//
// Accepts a zone suffix or a bare stamp (read as UTC, space
// separator tolerated, the fraction cut to milliseconds — see
// normalizeStamp); anything else answers null — callers never
// see an Invalid Date.
//
// Used by:
//   - core/reducers.ts — orders merged pages by stamp
//   - hooks/usePins.ts — the pinned banner's expiry
//   - hosts via the package surface (chatuikit ships its own
//     copy for timeline labels)
// -----------------------------------------------------------

export function parseStamp(iso: string | null | undefined): Date | null {
  const candidate = normalizeStamp(iso);
  if (!candidate) return null;
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
