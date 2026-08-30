// -----------------------------------------------------------
//  [*] chatengine — time
//
//  parseStamp: the one stamp parser. Backends disagree on what
//  "ISO" means — the engine accepts a zone suffix (Z, ±hh:mm),
//  reads a bare stamp as UTC (the common "naive UTC" shape),
//  and answers null instead of an Invalid Date for anything
//  else, so ordering code can treat null as "unknown".
//
//  Used by:
//    - core/reducers.ts — the resync merge sort
//    - hooks/useConversation.ts — the fresh-head gate
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

export const stampMs = (iso: string | null | undefined): number => parseStamp(iso)?.getTime() ?? 0;
