// -----------------------------------------------------------
//  [*] News — sharing a post
//
//  One share flow for the feed card and the article screen,
//  so a post shared from either says the same thing. Scraped
//  articles share their web address; app-native posts have
//  none, so a body excerpt plus the app's deep link goes out
//  instead — a bare (often backend-truncated) title alone
//  helps no recipient. A backend-defaulted title is just the
//  body's first 80 characters, and then the excerpt alone
//  carries the text once. The excerpt knows a list page's cut
//  body (`truncated`) and keeps its ellipsis.
//
//  The sheet's verdict comes back as 'shared' / 'dismissed'
//  (a dismissal rejects with AbortError on the web — that is
//  a dismissal, not a failure); a real failure rejects, and
//  the caller toasts. Only a completed share is worth
//  recording (sharePostApi) — the callers own their counters.
//
//  Split into:
//
//    SNIPPET_LENGTH — the excerpt's length
//    sharePayload   — post → the Share.share content
//    openShareSheet — the sheet, with its verdict
// -----------------------------------------------------------

// The app's own deep link for posts with no web address
import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import { titleRepeatsBody } from '@/services/newsText';
import type { NewsPost } from '@/types';


// The body excerpt an app-native post shares — a screenful of
// a message app, and exactly the feed's list-page cut
const SNIPPET_LENGTH = 200;







// -----------------------------------------------------------
// sharePayload
// -----------------------------------------------------------
//
// Pure: the title/message/url triple for Share.share — the
// web address for a scraped article, else the title (unless
// it merely repeats the body's head), the excerpt and the
// deep link, one per line.
//
// Used by:
//   - openShareSheet (below)
//   - __tests__/newsShare.test.ts
// -----------------------------------------------------------

export function sharePayload(post: NewsPost): { title: string; message: string; url?: string } {

  if (post.sourceUrl) {
    return { title: post.title, message: `${post.title}\n${post.sourceUrl}`, url: post.sourceUrl };
  }


  const body = post.content ?? '';
  const titleIsExcerpt = titleRepeatsBody(post.title, body);
  const cut = body.length > SNIPPET_LENGTH || post.truncated === true;
  const snippet = body ? (cut ? `${body.slice(0, SNIPPET_LENGTH).trimEnd()}…` : body) : '';


  return {
    title: post.title,
    message: [
      titleIsExcerpt ? '' : post.title,
      snippet,
      Linking.createURL('/news-post', { queryParams: { postId: post.id } }),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}







// -----------------------------------------------------------
// openShareSheet
// -----------------------------------------------------------
//
//   if (await openShareSheet(post) === 'shared') record()
//
// Rejects only on a real failure — a dismissal (including
// the web's AbortError) resolves 'dismissed'.
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed card's share
//   - app/(main)/news-post/index.tsx — the article's share
// -----------------------------------------------------------

export async function openShareSheet(post: NewsPost): Promise<'shared' | 'dismissed'> {
  try {
    const result = await Share.share(sharePayload(post));
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return 'dismissed';
    throw err;
  }
}
