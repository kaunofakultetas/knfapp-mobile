// -----------------------------------------------------------
//  [*] Chat — ConversationRow
//
//  One conversation of the messages list: portrait (photo with
//  online dot for direct chats, emoji/people disc for groups),
//  title, last-message preview, relative activity age, pin
//  mark and the capped unread pill. Unread rows step the whole
//  text column up one weight (bold title, ink preview) so they
//  actually stand out from read rows.
//
//  Swiping left reveals pin and delete actions (a long press
//  on the row toggles the pin too — delete stays swipe-only
//  and the OWNER confirms it). The age comes from
//  formatRelative(lastUpdatedMs), never from the backend's
//  UTC-preformatted `time` field; a conversation with no
//  messages yet shows no age at all.
//
//  Split into (root component last):
//
//    RowActions      — the swipe-revealed pin/delete panel
//    RowAvatar       — portrait per conversation type
//    ConversationRow — the row itself (default export)
// -----------------------------------------------------------

// Portrait and unread pill from the UI kit; the group stack from
// the messaging kit
import { StackedAvatars } from '@/chatkit';
import { Avatar, Badge } from '@/components/ui';

// Conversation shape straight from the chat API + upload paths
import { getUploadUrl, type ApiConversation } from '@/services/api';

// Relative "5 min" age of the last activity
import { formatRelative } from '@/services/format';

// JS-side icon colors + the session (own-message prefix)
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

// Row primitives and the swipe container
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';


interface ConversationRowProps {
  item: ApiConversation;
  currentUserId?: string;
  isOnline: boolean;
  onPress: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}







// -----------------------------------------------------------
// RowActions
// -----------------------------------------------------------
//
// The panel ReanimatedSwipeable reveals on a left swipe: a
// neutral pin/unpin column and a danger delete column. Both
// are real buttons with translated labels, so screen readers
// reach them without the swipe gesture.
//
// Used by:
//   - ConversationRow (below)
// -----------------------------------------------------------

function RowActions({
  pinned,
  onTogglePin,
  onDelete,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const pinLabel = pinned ? t('messages.unpin') : t('messages.pin');


  return (
    <View className="my-xs flex-row">

      <Pressable
        className="items-center justify-center rounded-l-xl bg-surface-soft"
        style={{ width: 72 }}
        onPress={onTogglePin}
        accessibilityRole="button"
        accessibilityLabel={pinLabel}
      >
        <Ionicons name={pinned ? 'pin-outline' : 'pin'} size={18} color={colors.inkSoft} />
        <Text className="mt-xs font-raleway text-xs text-ink-soft">{pinLabel}</Text>
      </Pressable>

      <Pressable
        className="items-center justify-center rounded-r-xl bg-danger"
        style={{ width: 72 }}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={t('messages.delete')}
      >
        <Ionicons name="trash-outline" size={18} color={colors.onBrand} />
        <Text className="mt-xs font-raleway text-xs text-on-brand">{t('messages.delete')}</Text>
      </Pressable>

    </View>
  );
}







// -----------------------------------------------------------
// RowAvatar
// -----------------------------------------------------------
//
// Direct chats show the OTHER participant's Avatar (photo or
// initial) with the online dot; groups show their emoji on a
// brand-soft disc, or — when none was picked — the first two
// members' portraits stacked, the way Messenger draws a group.
//
// Used by:
//   - ConversationRow (below)
// -----------------------------------------------------------

function RowAvatar({
  item,
  currentUserId,
  isOnline,
}: {
  item: ApiConversation;
  currentUserId?: string;
  isOnline: boolean;
}) {

  if (item.type === 'direct') {
    const other = item.participants.find((participant) => participant.id !== currentUserId);
    return (
      <Avatar
        uri={other?.avatarUrl}
        name={other?.displayName ?? item.title}
        size={48}
        online={isOnline}
      />
    );
  }


  if (item.avatarEmoji) {
    return (
      <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
        <Text style={{ fontSize: 22 }}>{item.avatarEmoji}</Text>
      </View>
    );
  }


  const members = item.participants
    .filter((participant) => participant.id !== currentUserId)
    .map((participant) => ({ name: participant.displayName, uri: participant.avatarUrl ? getUploadUrl(participant.avatarUrl) : undefined }));
  return <StackedAvatars members={members} size={48} />;
}







// -----------------------------------------------------------
// ConversationRow (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/messages.tsx — the conversations FlatList
// -----------------------------------------------------------

export default function ConversationRow({
  item,
  currentUserId,
  isOnline,
  onPress,
  onTogglePin,
  onDelete,
}: ConversationRowProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const hasUnread = item.unreadCount > 0;


  // Previews: an unsent last message shows its placeholder; an
  // own one is prefixed "You:"; group previews name the sender;
  // a photo-only message gets a placeholder word instead of an
  // empty line
  const last = item.lastMessage;
  const body = last
    ? last.deleted
      ? t('messages.deletedPreview')
      : last.text || t('messages.photoMessage')
    : '';
  const preview = last
    ? last.senderId === user?.id
      ? `${t('messages.youPrefix')} ${body}`
      : item.type === 'group' && last.senderName
        ? `${last.senderName}: ${body}`
        : body
    : t('messages.tapToStart');


  return (
    <ReanimatedSwipeable
      friction={2}
      overshootRight={false}
      renderRightActions={(_progress, _translation, methods) => (
        <RowActions
          pinned={item.pinned}
          onTogglePin={() => {
            methods.close();
            onTogglePin();
          }}
          onDelete={() => {
            methods.close();
            onDelete();
          }}
        />
      )}
    >
      <Pressable
        className="my-xs flex-row items-center rounded-xl bg-surface p-md"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 3,
          elevation: 1,
        }}
        onPress={onPress}
        onLongPress={onTogglePin}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >

        <View className="mr-md">
          <RowAvatar item={item} currentUserId={currentUserId} isOnline={isOnline} />
        </View>

        {/* Title, preview and (for groups) the member count */}
        <View className="flex-1">
          <Text
            className={
              hasUnread
                ? 'font-raleway-bold text-base text-ink'
                : 'font-raleway-semibold text-base text-ink'
            }
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            className={
              hasUnread
                ? 'mt-xs font-raleway-medium text-sm text-ink'
                : 'mt-xs font-raleway text-sm text-ink-soft'
            }
            numberOfLines={1}
          >
            {preview}
          </Text>
          {item.type === 'group' && (
            <Text className="mt-xs font-raleway text-xs text-ink-faint">
              {t('messages.members', { count: item.participants.length })}
            </Text>
          )}
        </View>

        {/* Age, pin mark and the unread pill — empty chats age-less */}
        <View className="ml-sm items-end">
          {last ? (
            <Text
              className={
                hasUnread
                  ? 'font-raleway-semibold text-xs text-brand'
                  : 'font-raleway text-xs text-ink-soft'
              }
            >
              {formatRelative(item.lastUpdatedMs)}
            </Text>
          ) : null}
          {item.pinned && (
            <Ionicons name="pin" size={12} color={colors.brand} style={{ marginTop: 4 }} />
          )}
          {hasUnread && (
            <View className="mt-xs">
              <Badge count={item.unreadCount} />
            </View>
          )}
        </View>

      </Pressable>
    </ReanimatedSwipeable>
  );
}
