// -----------------------------------------------------------
//  [*] Chat — conversationList
//
//  The pure logic behind the Messages tab and its rows, kept
//  out of the screen so it can be tested without rendering
//  one: the preview line a row shows for its last message,
//  and the patch a live new_message applies to a row. Both
//  follow the SAME preview contract the REST list answers
//  with — kind, unsent flag, system event — so a row reads
//  identically whether it arrived by socket or by refetch.
//
//  Split into:
//
//    conversationPreview — the preview line, per message kind
//    patchWithNewMessage — a row after a live new_message
// -----------------------------------------------------------

import { systemEventText } from '@/hooks/chat/useChatUiKitLabels';
import type { ApiConversation } from '@/services/api';
import type { SocketMessage } from '@/services/socket';

import { parseStamp } from '@knf/chatuikit';


// The translate function as the helpers take it — i18next's
// own signature is far wider than what they call
type Translate = (key: string, opts?: Record<string, unknown>) => string;







// -----------------------------------------------------------
// conversationPreview
// -----------------------------------------------------------
//
//   conversationPreview(item, userId, t)  → the row's 2nd line
//
// An unsent last message shows its placeholder; a system line
// is worded from its event (the stored prose only when there
// is none) and never takes a sender prefix; an own message is
// prefixed "You:" and a group's names its sender; a message
// with no text names its KIND — video, voice message, file,
// photo — so a voice note or a PDF is never announced as a
// photo; a room with no messages invites a first one.
//
// Used by:
//   - components/chat/ConversationRow.tsx — the visible line
//     and its a11y label
//   - __tests__/conversationPreview.test.ts
// -----------------------------------------------------------

export function conversationPreview(item: ApiConversation, userId: string | undefined, t: Translate): string {

  const last = item.lastMessage;
  if (!last) return t('messages.tapToStart');


  if (last.kind === 'system' && !last.deleted) {
    return systemEventText(t, last.system, last.senderName) ?? last.text ?? '';
  }


  const body = last.deleted
    ? t('messages.deletedPreview')
    : last.text
      || (last.kind === 'video' ? t('messages.videoMessage')
        : last.kind === 'audio' ? t('chat.voiceNote')
        : last.kind === 'file' ? t('messages.fileMessage')
        : t('messages.photoMessage'));
  if (last.senderId === userId) return `${t('messages.youPrefix')} ${body}`;
  if (item.type === 'group' && last.senderName) return `${last.senderName}: ${body}`;
  return body;
}







// -----------------------------------------------------------
// patchWithNewMessage
// -----------------------------------------------------------
//
//   patchWithNewMessage(row, socketMessage, selfId, activeId)
//     → the row as the REST list would now answer it
//
// A conversation row after a live new_message. The preview
// takes the WHOLE preview contract, not just the text — the
// kind (a caption-less video, file or voice note previews by
// its kind), the unsent flag and a system line's event; a
// patch without them once read "Photo" until the next
// refetch. The age comes from the SERVER stamp, never the
// device clock (a skewed clock would pin the row to the top).
// Own messages echo back too and never count as unread, and
// neither does a message for the room being read right now
// (`activeId` — the room acknowledges it through mark_read on
// this same event) nor a system line (the room narrating
// itself — the server's counts skip those too).
//
// Used by:
//   - app/(main)/tabs/messages.tsx — the new_message
//     subscription
//   - __tests__/conversationPreview.test.ts
// -----------------------------------------------------------

export function patchWithNewMessage(
  conversation: ApiConversation,
  message: SocketMessage,
  selfId: string | null,
  activeId: string | null,
): ApiConversation {
  return {
    ...conversation,
    lastUpdatedMs: parseStamp(message.createdAt)?.getTime() ?? conversation.lastUpdatedMs,
    unreadCount:
      message.senderId === selfId || message.conversationId === activeId || message.kind === 'system'
        ? conversation.unreadCount
        : conversation.unreadCount + 1,
    lastMessage: {
      id: message.id,
      text: message.text,
      imageUrl: message.imageUrl,
      // 'custom' is the engine's host-defined kind — the KNF
      // backend never sends it, and the list has no wording for it
      kind: message.kind === 'custom' ? undefined : message.kind,
      deleted: message.deleted,
      system: message.system ?? null,
      time: message.time,
      senderId: message.senderId,
      senderName: message.senderName,
    },
  };
}
