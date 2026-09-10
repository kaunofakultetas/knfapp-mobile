// -----------------------------------------------------------
//  [*] News text — scraped-article cleanup
//
//  The scraper stores each article's page text verbatim, and
//  vu.lt / knf.vu.lt pages open with chrome the reader has
//  already seen on the card: the date, the author line, the
//  title again, then category labels ("Mokslas", "VU
//  naujienos"). Rendering that as the first lines of the body
//  reads as a bug, so stripScrapedPreamble() drops the leading
//  lines that duplicate the post's own metadata or look like
//  short labels, and stops at the first real sentence.
//
//  Defensive by design: only scraped sources are touched at
//  all — community, faculty and app posts pass through
//  verbatim — and even a scraped body is only stripped when
//  the leading lines contain positive chrome evidence (a
//  title, author or date repeat), never on short lines alone.
// -----------------------------------------------------------

import type { NewsPost } from '@/types';


// Lines shorter than this with no sentence punctuation are
// treated as page chrome (category labels, author bylines)
const LABEL_MAX_LENGTH = 40;

// The stripper never eats more than this many non-empty lines
// — real chrome is short, a long run means real content
const MAX_PREAMBLE_LINES = 5;

// "2026 m. rugpjūčio 27 d.", "27.08.2026", "2026-08-27"
const DATE_LINE_RE = /^(\d{4}\s*m\.\s+\S+\s+\d{1,2}\s*d\.|\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\.?$/i;

// Case- and whitespace-insensitive line comparison, blind to
// markdown markers — a "## Title" heading line must still
// match the post's own plain title
const normalize = (text: string) => stripMarkdown(text).trim().toLowerCase().replace(/\s+/g, ' ');







// -----------------------------------------------------------
// isScrapedSource
// -----------------------------------------------------------
//
// The one predicate for "this body came off a scraped page":
// community, faculty and app posts name their source; every
// other value (knf.vu.lt, vu.lt, a missing field) is the
// scraper's. Scraped bodies are stored as light markdown and
// may open with page chrome — both consumers below branch on
// exactly this.
//
// Used by:
//   - stripScrapedPreamble (below)
//   - app/(main)/news-post/index.tsx — markdown vs plain body
// -----------------------------------------------------------

export function isScrapedSource(post: Pick<NewsPost, 'source'>): boolean {
  return post.source !== 'user' && post.source !== 'faculty' && post.source !== 'app';
}







// -----------------------------------------------------------
// stripMarkdown
// -----------------------------------------------------------
//
//   stripMarkdown(text) — the same text with every markdown
//                         marker removed
//
// The inverse of the scraper's light markdown: links keep
// their text and lose the URL, bold/italic keep their text,
// heading and list markers drop. Card snippets and the
// chrome comparison run on prose, never on markers.
//
// Used by:
//   - normalize (above) — the chrome line comparison
//   - components/news/NewsCard.tsx — the card snippet
// -----------------------------------------------------------

export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/^#{2,3} /gm, '')
    .replace(/^- /gm, '');
}







// -----------------------------------------------------------
// stripScrapedPreamble
// -----------------------------------------------------------
//
//   stripScrapedPreamble(post.content, post) — body without
//                                              the duplicated
//                                              header lines
//
// Used by:
//   - components/news/NewsCard.tsx — the card snippet
//   - app/(main)/news-post/index.tsx — the article body
// -----------------------------------------------------------

export function stripScrapedPreamble(
  content: string,
  post: Pick<NewsPost, 'title' | 'author' | 'source'>,
): string {
  if (!content) return content;


  // Only scraped articles carry page chrome — a community,
  // faculty or app post opening with a short line wrote it
  // on purpose
  if (!isScrapedSource(post)) {
    return content;
  }


  const known = new Set(
    [post.title, post.author].filter((v): v is string => !!v).map(normalize),
  );
  const lines = content.split('\n');


  // Walk past leading lines that are empty, repeat the
  // title/author, are a bare date, or read as short labels —
  // bounded to MAX_PREAMBLE_LINES non-empty lines, and only
  // committed when at least one line was actual chrome
  // (title/author/date), not merely short
  let start = 0;
  let stripped = 0;
  let sawChrome = false;
  while (start < lines.length) {
    const line = lines[start].trim();
    if (line === '') {
      start += 1;
      continue;
    }
    if (stripped >= MAX_PREAMBLE_LINES) break;
    // The chrome heuristics judge PROSE — a scraped body's
    // leading date can arrive as a "- " list line and its title
    // repeat as a "## " heading
    const prose = stripMarkdown(line).trim();
    const isChrome = known.has(normalize(line)) || DATE_LINE_RE.test(prose);
    const isLabel = prose.length <= LABEL_MAX_LENGTH && !/[.!?…:]$/.test(prose);
    if (isChrome || isLabel) {
      if (isChrome) sawChrome = true;
      stripped += 1;
      start += 1;
      continue;
    }
    break;
  }


  // No chrome evidence, or nothing survived (a very short
  // post) — keep the original body
  if (!sawChrome || start >= lines.length) return content.trim();
  return lines.slice(start).join('\n').trim();
}
