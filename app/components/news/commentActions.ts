// -----------------------------------------------------------
//  [*] News — comment rows and their actions
//
//  The article's inline thread and the full thread render the
//  same kit rows over the same wire rows, so the mapping and
//  the actions live here once:
//
//    - a long-press on a comment opens ONE action per viewer,
//      decided by the rule the backend enforces on DELETE
//      /news/<post>/comments/<id>: the comment's author, the
//      post's author and an admin may delete it (a confirm,
//      then the row leaves and the count follows); anyone
//      else signed in may report it. The report rides the
//      post lane of the complaint ledger (comments have no
//      lane of their own — adding one needs a schema change)
//      with the commenter's name and an excerpt in the
//      reason, so the moderator sees exactly what was flagged
//      and where. Guests get no action — the row stays inert.
//    - a tap on a commenter's portrait or name opens their
//      profile.
//
//  A second long-press on a row whose action is still on its
//  way is ignored; a 404 on delete means the comment is
//  already gone (deleted elsewhere, or the post with it) and
//  simply drops the row.
//
//  Split into:
//
//    REPORT_EXCERPT_LENGTH — the report's comment excerpt
//    toKitComment          — wire row → the kit's row shape
//    useCommentActions     — the long-press action per viewer
//    useOpenCommentAuthor  — the portrait's profile route
// -----------------------------------------------------------

// Session, toasts and the confirm dialog
import { confirmAction } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// The comment routes and the complaint ledger
import { ApiError, deleteCommentApi, reportTarget, type CommentResponse } from '@/services/api';

// Kit shapes, navigation, i18n
import type { KitComment, KitUser } from '@knf/socialuikit';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';


// A report's reason is capped at 1000 characters server-side;
// the comment rides in it as an excerpt this long
const REPORT_EXCERPT_LENGTH = 300;







// -----------------------------------------------------------
// toKitComment
// -----------------------------------------------------------
//
// The backend comment row in the kit's vocabulary. `time` is
// the raw created_at stamp (naive UTC) — the kit's
// RelativeTime reads a zone-less stamp as UTC, so no
// reformatting here. isOwn paints the viewer's own comments
// with the brand wash; a deleted comment leaves the list
// instead of standing as a placeholder (nobody else would
// see one — the backend removes the row outright).
//
// Used by:
//   - app/(main)/news-post/index.tsx — the inline thread
//   - app/(main)/news-comments/index.tsx — the full thread
// -----------------------------------------------------------

export const toKitComment = (comment: CommentResponse, viewerId: string | null): KitComment => ({
  id: comment.id,
  author: { id: comment.userId, displayName: comment.userName, avatarUrl: comment.userAvatar },
  text: comment.text,
  createdAt: comment.time,
  isOwn: viewerId !== null && comment.userId === viewerId,
});







// -----------------------------------------------------------
// useCommentActions
// -----------------------------------------------------------
//
//   const onLongPress = useCommentActions({ postId,
//     postAuthorId, onDeleted })
//   <CommentRow onLongPress={onLongPress} … />
//
// Answers undefined for a guest (or before the post is
// known), so the kit row stays inert. onDeleted(id, total)
// hears a confirmed delete — total is the server's recount,
// null when the comment was already gone — and should be a
// stable callback: the handler's identity follows it.
//
// Used by:
//   - app/(main)/news-post/index.tsx
//   - app/(main)/news-comments/index.tsx
// -----------------------------------------------------------

export function useCommentActions({
  postId,
  postAuthorId,
  onDeleted,
}: {
  postId: string | null | undefined;
  postAuthorId: string | null | undefined;
  onDeleted: (commentId: string, total: number | null) => void;
}): ((comment: KitComment) => void) | undefined {

  const { user } = useAuth();
  const { t } = useTranslation();
  // Rows whose action is on its way — a second long-press waits
  const busyRef = useRef(new Set<string>());


  // Delete: confirm, then the server's recount travels out
  const deleteComment = useCallback(
    async (targetPostId: string, comment: KitComment) => {
      const confirmed = await confirmAction({
        title: t('newsPost.deleteCommentTitle'),
        message: t('newsPost.deleteCommentConfirm'),
        confirmLabel: t('newsPost.deleteComment'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      try {
        const resp = await deleteCommentApi(targetPostId, comment.id);
        onDeleted(comment.id, resp.comments);
        showToast('success', t('newsPost.commentDeleted'));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'http' && err.status === 404) {
          onDeleted(comment.id, null);
          return;
        }
        showToast('error', t('newsPost.commentDeleteError'));
      }
    },
    [onDeleted, t],
  );


  // Report: confirm, then one ledger row on the post naming the
  // comment's author and carrying the text the reader flagged
  const reportComment = useCallback(
    async (targetPostId: string, comment: KitComment) => {
      const confirmed = await confirmAction({
        title: t('newsPost.reportCommentTitle'),
        message: t('newsPost.reportCommentConfirm'),
        confirmLabel: t('profile.report'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      const excerpt =
        comment.text.length > REPORT_EXCERPT_LENGTH ? `${comment.text.slice(0, REPORT_EXCERPT_LENGTH)}…` : comment.text;
      try {
        await reportTarget('post', targetPostId, t('newsPost.reportCommentReason', { name: comment.author.displayName, text: excerpt }));
        showToast('success', t('profile.reported'));
      } catch {
        showToast('error', t('profile.actionError'));
      }
    },
    [t],
  );


  const handle = useCallback(
    (comment: KitComment) => {
      if (!user || !postId || busyRef.current.has(comment.id)) return;
      const canDelete = comment.isOwn || (!!postAuthorId && postAuthorId === user.id) || user.role === 'admin';
      busyRef.current.add(comment.id);
      void (canDelete ? deleteComment(postId, comment) : reportComment(postId, comment)).finally(() => {
        busyRef.current.delete(comment.id);
      });
    },
    [user, postId, postAuthorId, deleteComment, reportComment],
  );


  return user && postId ? handle : undefined;
}







// -----------------------------------------------------------
// useOpenCommentAuthor
// -----------------------------------------------------------
//
// The kit row's portrait / name tap → that person's profile.
// A stable callback, so memoised row renderers keep their
// identity.
//
// Used by:
//   - app/(main)/news-post/index.tsx
//   - app/(main)/news-comments/index.tsx
// -----------------------------------------------------------

export function useOpenCommentAuthor(): (author: KitUser) => void {
  const router = useRouter();
  return useCallback(
    (author: KitUser) => router.push({ pathname: '/(main)/profile', params: { userId: author.id } }),
    [router],
  );
}
