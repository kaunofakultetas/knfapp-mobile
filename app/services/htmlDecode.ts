// -----------------------------------------------------------
//  [*] HtmlDecode — undo the backend's escape-on-output
//
//  The backend HTML-escapes every string in every JSON
//  response (backend/app/__init__.py escape_json_output,
//  html.escape(quote=True)) as XSS protection for web
//  consumers. React Native Text never interprets HTML, so
//  decoding for display is safe — and it happens in exactly
//  one place: the services/api/client.ts response interceptor
//  runs this over every string field recursively (URLs
//  included — an escaped '&amp;' in a query string breaks
//  image loads). Screens never call this themselves.
//
//  The map covers html.escape's full output plus the
//  markupsafe-style &#34; defensively, in case the backend
//  ever swaps escapers.
// -----------------------------------------------------------


// Only entities the backend can actually emit (plus close
// relatives) — not a general-purpose HTML entity decoder
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#47;': '/',
  '&apos;': "'",
  '&nbsp;': '\u00A0',
};

// One alternation kept in lockstep with ENTITY_MAP
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#34|#39|#x27|#x2F|#47);/g;







// -----------------------------------------------------------
// decodeHtmlEntities
// -----------------------------------------------------------
//
// Non-strings pass through untouched — the interceptor walks
// arbitrary response shapes and calls this on every leaf.
//
// Used by:
//   - services/api/client.ts — response interceptor
// -----------------------------------------------------------

export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(ENTITY_RE, (match) => ENTITY_MAP[match] || match);
}
