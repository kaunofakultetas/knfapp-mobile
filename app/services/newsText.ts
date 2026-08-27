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
//  Defensive by design: an article whose body genuinely starts
//  with a short line loses at most that line, and community
//  posts (no scraper chrome) pass through untouched.
// -----------------------------------------------------------

import type { NewsPost } from '@/types';


// Lines shorter than this with no sentence punctuation are
// treated as page chrome (category labels, author bylines)
const LABEL_MAX_LENGTH = 40;

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

export function stripScrapedPreamble(content: string, post: Pick<NewsPost, 'title' | 'author'>): string {
  if (!content) return content;


  const known = new Set(
    [post.title, post.author].filter((v): v is string => !!v).map(normalize),
  );
  const lines = content.split('\n');


  // Walk past every leading line that is empty, repeats the
  // title/author, is a bare date, or reads as a short label
  let start = 0;
  while (start < lines.length) {
    const line = lines[start].trim();
    const isLabel = line.length <= LABEL_MAX_LENGTH && !/[.!?…:]$/.test(line);
    if (line === '' || known.has(normalize(line)) || DATE_LINE_RE.test(line) || isLabel) {
      start += 1;
      continue;
    }
    break;
  }


  // Nothing survived (a very short post) — keep the original
  if (start >= lines.length) return content.trim();
  return lines.slice(start).join('\n').trim();
}
