// -----------------------------------------------------------
//  [*] News — CommentRow
//
//  One comment of a post's discussion: the author's Avatar,
//  their name, a localized timestamp and the text on a
//  surface bubble. The backend `time` field is the raw
//  created_at ISO string (naive UTC) — formatDateTime marks
//  it UTC before parsing, so the row shows a device-zone
//  clock in the active language instead of the raw ISO the
//  old screens rendered.
//
//  Pure display — no presses, no state — so rows stay cheap
//  in long FlatList threads.
// -----------------------------------------------------------

// Author portrait with the initial fallback
import { Avatar } from '@/components/ui';

// The comment payload shape
import type { CommentResponse } from '@/services/api';

// created_at ISO → localized date + time
import { formatDateTime } from '@/services/format';

// Row primitives
import { Text, View } from 'react-native';







// -----------------------------------------------------------
// CommentRow (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/news-post/index.tsx — the inline thread
//   - app/(main)/news-comments/index.tsx — the full thread
// -----------------------------------------------------------

export default function CommentRow({ comment }: { comment: CommentResponse }) {
  return (
    <View className="mb-md flex-row gap-sm">

      <Avatar uri={comment.userAvatar} name={comment.userName} size={36} />

      <View className="flex-1 rounded-lg bg-surface p-sm">
        <View className="flex-row items-baseline justify-between gap-sm">
          <Text className="flex-1 font-raleway-bold text-xs text-brand" numberOfLines={1}>
            {comment.userName}
          </Text>
          <Text className="font-raleway text-xs text-ink-faint">
            {formatDateTime(comment.time)}
          </Text>
        </View>
        <Text className="mt-xs font-raleway text-sm leading-5 text-ink">
          {comment.text}
        </Text>
      </View>

    </View>
  );
}
