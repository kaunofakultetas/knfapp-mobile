// -----------------------------------------------------------
//  [*] Chat — MessageBubble
//
//  One message of the room: own messages sit right on a brand
//  bubble, others sit left on a surface bubble with the sender
//  name. Failed own sends restyle to a danger wash with a
//  "Neišsiųsta · Bandyti dar kartą" row — tapping the bubble
//  retries. Long-press anywhere opens the reaction picker;
//  the reaction chips under the bubble open the reactors
//  sheet, with a brand ring when one of the groups is mine.
//
//  Images size themselves from the loaded asset's aspect
//  ratio, capped in BOTH dimensions, so portrait screenshots
//  are no longer cropped into a fixed landscape box. The
//  message stores a RELATIVE upload path — getUploadUrl
//  resolves it here, at render time only.
//
//  Time comes from formatTime(createdAt) — the backend's
//  preformatted `time` field is UTC-wrong and ignored.
//
//  Split into (root component last):
//
//    StatusMark    — delivery state icon with a11y text
//    ReactionChips — the emoji/count pill under the bubble
//    MessageBubble — the bubble itself (default export)
// -----------------------------------------------------------

// Render-time upload resolution and display time
import { getUploadUrl } from '@/services/api';
import { formatTime } from '@/services/format';

// Theme-side icon/spinner colors
import { useTheme } from '@/hooks/useTheme';

// Message shape
import type { ChatMessage } from '@/types';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';


// Caps for image bubbles — width AND height, so the aspect-
// ratio fit below can never overflow either way
const MAX_IMAGE_WIDTH = 240;
const MAX_IMAGE_HEIGHT = 300;







// -----------------------------------------------------------
// StatusMark
// -----------------------------------------------------------
//
// The delivery-state glyph on own, non-failed bubbles: a tiny
// spinner while 'sending', one check for 'sent', double for
// 'delivered', info-tinted double for 'read' — each wrapped so
// screen readers announce the translated state.
//
// Used by:
//   - MessageBubble (below)
// -----------------------------------------------------------

function StatusMark({ status }: { status: ChatMessage['status'] }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (status === 'sending') {
    return (
      <View accessible accessibilityLabel={t('chat.sending')} className="ml-xs">
        <ActivityIndicator
          size="small"
          color={colors.onBrand}
          style={{ transform: [{ scale: 0.6 }] }}
        />
      </View>
    );
  }


  if (status === 'read') {
    return (
      <View accessible accessibilityLabel={t('chat.read')} className="ml-xs">
        <Ionicons name="checkmark-done" size={14} color={colors.info} />
      </View>
    );
  }


  if (status === 'delivered') {
    return (
      <View accessible accessibilityLabel={t('chat.delivered')} className="ml-xs">
        <Ionicons name="checkmark-done" size={14} color={colors.onBrand} />
      </View>
    );
  }


  return (
    <View accessible accessibilityLabel={t('chat.sent')} className="ml-xs">
      <Ionicons name="checkmark" size={14} color={colors.onBrand} />
    </View>
  );
}







// -----------------------------------------------------------
// ReactionChips
// -----------------------------------------------------------
//
// The pill under a bubble listing each emoji group with its
// count; a brand border marks that one of the groups carries
// my reaction. Tapping opens the reactors sheet.
//
// Used by:
//   - MessageBubble (below)
// -----------------------------------------------------------

function ReactionChips({
  message,
  onPress,
}: {
  message: ChatMessage;
  onPress: () => void;
}) {

  const { t } = useTranslation();


  const mine = message.reactions.some((r) => r.bySelf);


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('chat.reactionsTitle')}
      hitSlop={8}
      className={
        mine
          ? 'mt-xs flex-row items-center rounded-full border border-brand bg-surface px-sm py-0.5'
          : 'mt-xs flex-row items-center rounded-full border border-line bg-surface px-sm py-0.5'
      }
    >
      {message.reactions.map((r) => (
        <Text key={r.emoji} className="mr-xs font-raleway text-xs text-ink">
          {r.emoji} {r.count}
        </Text>
      ))}
    </Pressable>
  );
}







// -----------------------------------------------------------
// MessageBubble (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/chat/MessageList.tsx — renderItem
// -----------------------------------------------------------

export default function MessageBubble({
  message,
  onLongPress,
  onPressReactions,
  onPressImage,
  onRetry,
}: {
  message: ChatMessage;
  onLongPress: (message: ChatMessage) => void;
  onPressReactions: (message: ChatMessage) => void;
  onPressImage: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // The loaded asset's ratio drives the bubble image size; a
  // 4:3 guess avoids a layout jump for the common case
  const [imageRatio, setImageRatio] = useState(4 / 3);


  const isFailed = message.status === 'failed';
  const isBrandBubble = message.isOwn && !isFailed;


  // Fit inside both caps while honoring the aspect ratio
  const imageWidth = Math.min(MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT * imageRatio);
  const imageHeight = imageWidth / imageRatio;


  const bubbleClass = message.isOwn
    ? isFailed
      ? 'rounded-xl border border-danger bg-danger-soft px-sm py-sm'
      : 'rounded-xl bg-brand px-sm py-sm'
    : 'rounded-xl border border-line bg-surface px-sm py-sm';

  const accessibilityLabel = isFailed
    ? `${t('chat.sendFailed')}. ${t('common.tryAgain')}`
    : `${message.senderName}, ${message.text || t('chat.photoMessage')}`;


  return (
    <View
      className={
        message.isOwn
          ? 'my-0.5 max-w-[80%] items-end self-end'
          : 'my-0.5 max-w-[80%] items-start self-start'
      }
    >

      <Pressable
        onLongPress={() => onLongPress(message)}
        onPress={isFailed ? () => onRetry(message) : undefined}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={bubbleClass}
      >

        {!message.isOwn && (
          <Text className="mb-0.5 font-raleway-bold text-xs text-brand">
            {message.senderName}
          </Text>
        )}

        {message.imageUrl ? (
          <Pressable
            onPress={() => onPressImage(message)}
            onLongPress={() => onLongPress(message)}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('chat.photoMessage')}
          >
            <Image
              source={{ uri: getUploadUrl(message.imageUrl) }}
              style={{ width: imageWidth, height: imageHeight, borderRadius: 8 }}
              resizeMode="cover"
              onLoad={(e) => {
                // RN reports the intrinsic size on load — adopt
                // the real ratio so portraits are never cropped
                const source = e.nativeEvent?.source;
                if (source?.width && source?.height) {
                  setImageRatio(source.width / source.height);
                }
              }}
            />
          </Pressable>
        ) : (
          <Text
            className={
              isBrandBubble
                ? 'font-raleway text-base text-on-brand'
                : 'font-raleway text-base text-ink'
            }
          >
            {message.text}
          </Text>
        )}

        {/* Meta row — local time from createdAt + delivery state */}
        <View className={message.isOwn ? 'mt-0.5 flex-row items-center self-end' : 'mt-0.5 flex-row items-center'}>
          <Text
            style={{ opacity: 0.8 }}
            className={
              isBrandBubble
                ? 'font-raleway text-xs text-on-brand'
                : 'font-raleway text-xs text-ink-soft'
            }
          >
            {formatTime(message.createdAt)}
          </Text>
          {isFailed && (
            <View className="ml-xs flex-row items-center">
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text className="ml-xs font-raleway-semibold text-xs text-danger">
                {t('chat.sendFailed')} · {t('common.tryAgain')}
              </Text>
            </View>
          )}
          {message.isOwn && !isFailed && <StatusMark status={message.status} />}
        </View>

      </Pressable>

      {message.reactions.length > 0 && (
        <ReactionChips message={message} onPress={() => onPressReactions(message)} />
      )}

    </View>
  );
}
