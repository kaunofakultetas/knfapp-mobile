// -----------------------------------------------------------
//  [*] News — the opened post's resync
//
//  A list pushes the article screen and stays mounted under
//  it; whatever happens there — a like, a comment, a vote, an
//  edit, the post deleted from its header — never reaches the
//  row the reader tapped. The news tab and the profile both
//  remember WHICH post they opened and, on the way back,
//  re-read that one post on its own: the row takes the fresh
//  values at any depth of the list (a page-1 refresh would
//  only see the head, and would give up the reader's place),
//  and a 404 — deleted, or hidden since — takes the row away,
//  so a list never shows a ghost that contradicts a count
//  beside it (KNF-108). Any other failure leaves the row as
//  it was: a stale row beats a vanished one.
//
//  Used by:
//    - app/(main)/tabs/news.tsx — the focus-return merge
//    - app/(main)/profile/index.tsx — the profile's post list
// -----------------------------------------------------------

import { ApiError, fetchNewsPost } from '@/services/api';
import type { NewsPost } from '@/types';







// -----------------------------------------------------------
// resyncOpenedPost
// -----------------------------------------------------------
//
//   await resyncOpenedPost(id, feed.setItems)
//
// The row keeps the fields only its own list carries (the
// community feed's authorAvatar) — the fresh post is spread
// over it. Resolves once the row has been patched, removed
// or left alone; never rejects.
//
// Used by:
//   - app/(main)/tabs/news.tsx, app/(main)/profile/index.tsx
// -----------------------------------------------------------

export async function resyncOpenedPost<T extends NewsPost>(
  postId: string,
  setItems: (updater: (items: T[]) => T[]) => void,
): Promise<void> {
  try {
    const fresh = await fetchNewsPost(postId);
    setItems((items) => items.map((item) => (item.id === postId ? { ...item, ...fresh } : item)));
  } catch (err) {
    // Gone while it was open — the row goes with it
    if (err instanceof ApiError && err.status === 404) {
      setItems((items) => items.filter((item) => item.id !== postId));
    }
  }
}
