/**
 * Decode HTML entities from backend escape-on-output middleware.
 * The backend intentionally escapes HTML in responses for XSS protection.
 * This decodes common entities for safe display in React Native Text components
 * (which don't interpret HTML, so there is no XSS risk here).
 */

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#47;': '/',
  '&apos;': "'",
  '&nbsp;': '\u00A0',
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#x2F|#47);/g;

/**
 * Decode HTML entities in a string for display.
 * Returns the original value unchanged if it's not a string.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(ENTITY_RE, (match) => ENTITY_MAP[match] || match);
}
