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

// Case- and whitespace-insensitive line comparison
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');







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
  if (post.source === 'user' || post.source === 'faculty' || post.source === 'app') {
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
    const isChrome = known.has(normalize(line)) || DATE_LINE_RE.test(line);
    const isLabel = line.length <= LABEL_MAX_LENGTH && !/[.!?…:]$/.test(line);
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
