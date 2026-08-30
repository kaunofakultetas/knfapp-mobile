// -----------------------------------------------------------
//  [*] chatkit — MessageBubble
//
//  One message row, iMessage-style: own messages on the right
//  in the brand colour, everyone else's on the left on the
//  soft surface, no borders. A run of consecutive messages
//  tightens — the corners facing the neighbours flatten and
//  only the run's edges carry the sender name (group chats),
//  the avatar and the receipt line — so a conversation reads
//  as speech, not as a table.
//
//  Inside the bubble, top to bottom: the quoted message of a
//  reply (tinted block, tap jumps to the original), the photo
//  or the text with tappable links. An unsent message renders
//  a muted italic placeholder in an outlined bubble. Reactions
//  sit as small pills overlapping the bubble's bottom edge.
//
//  Gestures: tap toggles the timestamp, long-press measures
//  the bubble and hands the frame up (the context menu floats
//  a copy in place), a horizontal drag towards the middle
//  reveals a reply glyph and triggers reply past the threshold
//  (WhatsApp / iMessage swipe-to-reply). The drag is a pan
//  gesture that fails on vertical movement so the list keeps
//  scrolling normally.
//
//  Under the last bubble of an own run: the delivery state
//  (sending / sent / delivered / read) — or, for a failed
//  send, a red "not sent · try again" that retries on tap.
//
//  Split into (root component last):
//
//    bubbleRadii    — corner set for a group position
//    ReplyQuote     — the quoted message block
//    MessageText    — text with tappable links
//    BubbleBody     — the bubble itself (also used as the
//                     context menu's floating copy)
//    ReceiptLine    — status / time under the bubble
//    MessageBubble  — the row (default export, memoised)
// -----------------------------------------------------------

// Theme + upload URL resolution + labels
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { formatTime } from '@/services/format';
import type { KitLabels } from './labels';

// Rendering + gestures
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  FadeInUp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Kit pieces
import KitAvatar from './KitAvatar';
import { linkify, type TextSegment } from './linkify';
import {
  AVATAR_COLUMN,
  AVATAR_SIZE,
  BLOCK_GAP,
  BUBBLE_MAX_WIDTH,
  BUBBLE_PADDING_H,
  BUBBLE_PADDING_V,
  BUBBLE_RADIUS,
  BUBBLE_TIGHT_RADIUS,
  IMAGE_MAX_HEIGHT,
  IMAGE_MAX_WIDTH,
  RUN_GAP,
} from './metrics';
import ReactionPills from './ReactionPills';
import type { ContextTarget, GroupPosition, KitMessage, KitReply } from './types';


const isWeb = Platform.OS === 'web';

// Swipe-to-reply: how far the bubble may travel, where it
// triggers, and the spring that brings it home
const SWIPE_MAX = 72;
const SWIPE_TRIGGER = 52;
const SWIPE_SPRING = { damping: 22, stiffness: 260, mass: 0.8, overshootClamping: true };

// What the 'React' accessibility action applies — the same
// thumbs-up the composer's quick-like sends
const DEFAULT_REACTION_EMOJI = '👍';

const haptic = (kind: 'light' | 'medium' | 'select') => {
  if (isWeb) return;
  if (kind === 'select') void Haptics.selectionAsync();
  else void Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
};







// -----------------------------------------------------------
// bubbleRadii
// -----------------------------------------------------------
//
// The corners facing the neighbours in a run flatten: an own
// bubble's right side, another sender's left side.
//
// Used by:
//   - BubbleBody (below)
// -----------------------------------------------------------

export function bubbleRadii(position: GroupPosition, own: boolean): ViewStyle {
  const top = position === 'middle' || position === 'last' ? BUBBLE_TIGHT_RADIUS : BUBBLE_RADIUS;
  const bottom = position === 'middle' || position === 'first' ? BUBBLE_TIGHT_RADIUS : BUBBLE_RADIUS;
  return own
    ? { borderTopLeftRadius: BUBBLE_RADIUS, borderBottomLeftRadius: BUBBLE_RADIUS, borderTopRightRadius: top, borderBottomRightRadius: bottom }
    : { borderTopRightRadius: BUBBLE_RADIUS, borderBottomRightRadius: BUBBLE_RADIUS, borderTopLeftRadius: top, borderBottomLeftRadius: bottom };
}







// -----------------------------------------------------------
// ReplyQuote
// -----------------------------------------------------------
//
// The quoted message inside a reply bubble: accent bar, the
// quoted sender, one line of their text (or "Photo", or the
// deleted placeholder). A tap jumps to the original.
//
// Used by:
//   - BubbleBody (below)
// -----------------------------------------------------------

function ReplyQuote({
  reply,
  own,
  labels,
  onPress,
  onLongPress,
}: {
  reply: KitReply;
  own: boolean;
  // Resolved once per row and threaded down — a hook call in
  // every leaf would subscribe each one to i18next
  labels: KitLabels;
  onPress?: () => void;
  onLongPress?: () => void;
}) {

  const { colors } = useTheme();


  const snippet = reply.deleted ? labels.deleted : reply.text || (reply.imageUrl ? labels.photo : '');
  const nameColor = own ? colors.onBrand : colors.brand;
  const textColor = own ? colors.onBrand : colors.ink;


  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      disabled={!onPress && !onLongPress}
      // No button role: the bubble around it is the button, and
      // nested buttons are invalid on web
      accessible={!!onPress}
      accessibilityLabel={`${reply.senderName}: ${snippet}`}
      accessibilityHint={onPress ? labels.jumpToQuoted : undefined}
      style={{
        flexDirection: 'row',
        overflow: 'hidden',
        borderRadius: 10,
        marginBottom: 6,
        minWidth: 150,
        backgroundColor: own ? colors.onBrandWash : colors.quoteWash,
      }}
    >
      <View style={{ width: 3, backgroundColor: own ? colors.onBrand : colors.brand }} />
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 5 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 15, color: nameColor }} numberOfLines={1}>
          {reply.senderName}
        </Text>
        <Text
          // Full-strength white: at 0.9 the snippet dropped under
          // AA contrast on the dark own-bubble wash
          style={{
            fontFamily: fonts.regular,
            fontSize: 13,
            lineHeight: 17,
            color: textColor,
            fontStyle: reply.deleted ? 'italic' : 'normal',
          }}
          numberOfLines={1}
        >
          {snippet}
        </Text>
      </View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// MessageText
// -----------------------------------------------------------
//
// Body text with URLs rendered as underlined, tappable runs.
// MessageBubble hands down the segments it already computed for
// the accessibility link actions; the context menu's floating
// copy has none and linkifies here instead.
//
// Used by:
//   - BubbleBody (below)
// -----------------------------------------------------------

function MessageText({
  text,
  color,
  linkColor,
  labels,
  segments: segmentsProp,
  onPressLink,
}: {
  text: string;
  color: string;
  linkColor: string;
  labels: KitLabels;
  segments?: TextSegment[];
  onPressLink?: (href: string) => void;
}) {

  const computed = useMemo(() => (segmentsProp ? null : linkify(text)), [segmentsProp, text]);
  const segments = segmentsProp ?? computed ?? [];


  return (
    <Text style={{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 21, color }}>
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <Text
            key={index}
            style={{ textDecorationLine: 'underline', fontFamily: fonts.medium, color: linkColor }}
            onPress={onPressLink ? () => onPressLink(segment.href) : undefined}
            accessibilityLabel={`${labels.openLink}: ${segment.value}`}
          >
            {segment.value}
          </Text>
        ) : (
          segment.value
        ),
      )}
    </Text>
  );
}







// -----------------------------------------------------------
// BubbleBody
// -----------------------------------------------------------
//
// The bubble alone — background, corners, quote, photo or
// text. MessageBubble wraps it with gestures, avatar, name,
// reactions and the receipt; MessageContextMenu renders a
// second copy of it at the measured frame.
//
// Used by:
//   - MessageBubble (below)
//   - chatkit/MessageContextMenu.tsx — the floating copy
// -----------------------------------------------------------

export function BubbleBody({
  message,
  position,
  labels,
  segments,
  initialImageRatio,
  onPressQuote,
  onPressImage,
  onPressLink,
  onLongPress,
  onImageRatio,
}: {
  message: KitMessage;
  position: GroupPosition;
  // Resolved once by the owner (MessageBubble, the context menu)
  labels: KitLabels;
  // The link segments MessageBubble already computed (the
  // floating copy omits them and linkifies on its own)
  segments?: TextSegment[];
  // The context menu's floating copy starts from the ratio the
  // real bubble measured, so a photo never re-guesses at 4:3
  initialImageRatio?: number;
  onPressQuote?: () => void;
  onPressImage?: () => void;
  onPressLink?: (href: string) => void;
  // Inner pressables (quote, photo) hand a long-press back up so
  // the menu opens wherever the finger lands
  onLongPress?: () => void;
  // Reports the measured photo ratio up, into the context target
  onImageRatio?: (ratio: number) => void;
}) {

  const { colors } = useTheme();


  // The loaded asset's ratio drives the photo size; a 4:3 guess
  // avoids a layout jump for the common case
  const [imageRatio, setImageRatio] = useState(initialImageRatio ?? 4 / 3);
  const imageWidth = Math.min(IMAGE_MAX_WIDTH, IMAGE_MAX_HEIGHT * imageRatio);
  const imageHeight = imageWidth / imageRatio;

  // A photo that cannot load renders a labelled placeholder in
  // its place — never a blank hole in the run (the Avatar rule);
  // a changed uri (local preview → uploaded path) gets a fresh try
  const [imageFailed, setImageFailed] = useState(false);
  const photoUri = message.localImageUri ?? getUploadUrl(message.imageUrl ?? '') ?? undefined;
  useEffect(() => setImageFailed(false), [photoUri]);


  const own = message.isOwn;
  const failed = message.status === 'failed';
  const deleted = !!message.deleted;
  // A photo send shows the picked file from the first frame — the
  // server path arrives after the upload
  const photo = (!!message.imageUrl || !!message.localImageUri) && !deleted;
  const brandBubble = own && !failed && !deleted;


  // A photo fills the bubble edge to edge (the bubble clips it
  // to the grouped corners); a quote above it keeps the padding
  const style: ViewStyle = {
    ...bubbleRadii(position, own),
    backgroundColor: deleted ? 'transparent' : failed ? colors.dangerSoft : own ? colors.bubbleOut : colors.bubbleIn,
    borderWidth: deleted || failed ? 1 : 0,
    borderStyle: deleted ? 'dashed' : 'solid',
    borderColor: failed ? colors.danger : colors.lineStrong,
    paddingHorizontal: photo ? 0 : BUBBLE_PADDING_H,
    paddingVertical: photo ? 0 : BUBBLE_PADDING_V,
    opacity: message.status === 'sending' ? 0.7 : 1,
    overflow: 'hidden',
  };


  if (deleted) {
    return (
      <View style={style}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="ban-outline" size={14} color={colors.inkSoft} />
          <Text
            style={{ marginLeft: 6, fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 15, lineHeight: 20, color: colors.inkSoft }}
          >
            {labels.deleted}
          </Text>
        </View>
      </View>
    );
  }


  return (
    <View style={style}>
      {message.replyTo ? (
        <View style={photo ? { paddingHorizontal: BUBBLE_PADDING_H, paddingTop: BUBBLE_PADDING_V } : undefined}>
          <ReplyQuote reply={message.replyTo} own={brandBubble} labels={labels} onPress={onPressQuote} onLongPress={onLongPress} />
        </View>
      ) : null}

      {photo ? (
        <Pressable
          // The viewer has no entry until the upload finished — an
          // unsent or failed photo is disabled so its taps and
          // long-presses fall through to the bubble's own handlers
          onPress={onPressImage}
          onLongPress={onLongPress}
          delayLongPress={260}
          disabled={!message.imageUrl}
          accessible={!!onPressImage && !!message.imageUrl}
          accessibilityLabel={labels.photo}
        >
          {imageFailed ? (
            <View
              style={{ width: imageWidth, height: imageHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft }}
              accessible
              accessibilityLabel={labels.imageUnavailable}
            >
              <Ionicons name="image-outline" size={28} color={colors.inkSoft} />
              <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.inkSoft }}>
                {labels.imageUnavailable}
              </Text>
            </View>
          ) : (
            <ExpoImage
              source={{ uri: photoUri }}
              style={{ width: imageWidth, height: imageHeight }}
              contentFit="cover"
              transition={120}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) {
                  setImageRatio(width / height);
                  onImageRatio?.(width / height);
                }
              }}
              onError={() => setImageFailed(true)}
            />
          )}
          {message.text ? (
            <View style={{ paddingHorizontal: BUBBLE_PADDING_H, paddingTop: 6, paddingBottom: BUBBLE_PADDING_V }}>
              <MessageText text={message.text} color={brandBubble ? colors.onBrand : colors.ink} linkColor={brandBubble ? colors.onBrand : colors.brandText} labels={labels} segments={segments} onPressLink={onPressLink} />
            </View>
          ) : null}
        </Pressable>
      ) : (
        <MessageText text={message.text} color={brandBubble ? colors.onBrand : colors.ink} linkColor={brandBubble ? colors.onBrand : colors.brandText} labels={labels} segments={segments} onPressLink={onPressLink} />
      )}
    </View>
  );
}







// -----------------------------------------------------------
// ReceiptLine
// -----------------------------------------------------------
//
// Under the bubble: the revealed time and, for the last own
// bubble of a run, the delivery state. A failed send becomes
// the red retry affordance.
//
// Used by:
//   - MessageBubble (below)
// -----------------------------------------------------------

function ReceiptLine({
  message,
  timeText,
  labels,
  showStatus,
  showTime,
  onRetry,
}: {
  message: KitMessage;
  // Formatted once by MessageBubble and shared with its a11y label
  timeText: string;
  labels: KitLabels;
  showStatus: boolean;
  showTime: boolean;
  onRetry: () => void;
}) {

  const { colors } = useTheme();


  if (message.status === 'failed') {
    return (
      <Pressable
        onPress={onRetry}
        // The row is ~16pt tall — the slop takes the target to 44
        hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${labels.notSent}. ${labels.tryAgain}`}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 3 }}
      >
        <Ionicons name="alert-circle" size={13} color={colors.danger} />
        <Text style={{ marginLeft: 4, fontFamily: fonts.semiBold, fontSize: 11, lineHeight: 14, color: colors.danger }}>
          {labels.notSent} · {labels.tryAgain}
        </Text>
      </Pressable>
    );
  }


  if (!showStatus && !showTime) return null;


  const status =
    message.status === 'sending' ? labels.sending
    : message.status === 'read' ? labels.read
    : message.status === 'delivered' ? labels.delivered
    : labels.sent;
  const parts = [...(showTime ? [timeText] : []), ...(showStatus ? [status] : [])];


  return (
    <Animated.View
      // The inverted native cell mirrors Y, so 'Down' rises there;
      // the upright web list rises with 'Up'
      entering={isWeb ? FadeInUp.duration(140) : FadeInDown.duration(140)}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 }}
    >
      {showStatus && message.status === 'sending' ? (
        <ActivityIndicator size={10} color={colors.inkFaint} style={{ marginRight: 4 }} />
      ) : null}
      {showStatus && message.status === 'read' ? (
        <Ionicons name="checkmark-done" size={12} color={colors.brand} style={{ marginRight: 3 }} />
      ) : null}
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: colors.inkSoft }}>
        {parts.join(' · ')}
      </Text>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// MessageBubble (default export)
// -----------------------------------------------------------
//
// Memoised on its props — the list re-renders on every socket
// event, and only the rows whose message object or flags
// changed should paint.
//
// Used by:
//   - chatkit/MessageList.tsx — one per message row
// -----------------------------------------------------------

function MessageBubbleInner({
  message,
  position,
  showSender,
  avatarSlot,
  timeRevealed,
  showStatus,
  highlighted,
  animateIn,
  hidden,
  canAct,
  canReply,
  labels,
  onPress,
  onLongPress,
  onSwipeReply,
  onPressQuote,
  onPressImage,
  onPressReactions,
  onRetry,
  onPressLink,
  onCopy,
  onReact,
}: {
  message: KitMessage;
  position: GroupPosition;
  showSender: boolean;
  // Group chats reserve the column; the run's last bubble shows the portrait
  avatarSlot: 'none' | 'blank' | 'show';
  timeRevealed: boolean;
  showStatus: boolean;
  highlighted: boolean;
  animateIn: boolean;
  // The context menu floats a copy of this bubble — the source
  // row steps out so it does not peek from under the copy
  hidden: boolean;
  // Optimistic rows have no server id yet: `canAct` opens the
  // menu (a failed temp still offers Delete), `canReply` allows
  // the swipe and the reply accessibility action
  canAct: boolean;
  canReply: boolean;
  // Resolved once by MessageList and threaded down, so a window
  // of rows does not carry a hook subscription per leaf
  labels: KitLabels;
  onPress: (message: KitMessage) => void;
  onLongPress: (target: ContextTarget) => void;
  onSwipeReply: (message: KitMessage) => void;
  onPressQuote: (message: KitMessage) => void;
  onPressImage: (message: KitMessage) => void;
  onPressReactions: (message: KitMessage) => void;
  onRetry: (message: KitMessage) => void;
  onPressLink: (href: string) => void;
  // Direct handlers for the Copy / React accessibility actions —
  // without them those actions fall back to opening the menu
  onCopy?: (message: KitMessage) => void;
  onReact?: (message: KitMessage, emoji: string) => void;
}) {

  const { colors } = useTheme();


  const own = message.isOwn;
  const deleted = !!message.deleted;
  const hasReactions = message.reactions.length > 0;
  const tight = position === 'middle' || position === 'last';


  // Long-press measures the bubble so the context menu can float
  // a copy exactly where this one sits. The photo ratio the body
  // measured rides along — the copy must not restart from the
  // 4:3 guess inside a frame sized for the real ratio
  const bodyRef = useRef<View>(null);
  const imageRatioRef = useRef<number | undefined>(undefined);
  const reportImageRatio = useCallback((ratio: number) => {
    imageRatioRef.current = ratio;
  }, []);
  const actionable = canAct && !deleted;
  const swipeable = canReply && !deleted;
  const longPress = () => {
    if (!actionable) return;
    haptic('medium');
    bodyRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ message, position, frame: { x, y, width, height }, imageRatio: imageRatioRef.current });
    });
  };


  // Swipe-to-reply: the bubble follows the finger with
  // resistance and a reply glyph grows behind it. Crossing the
  // threshold arms it (one haptic); the reply fires on release
  // only when the gesture SUCCEEDS still past the threshold —
  // a cancelled gesture (navigation, scroll takeover) must not
  // reply. The message rides in a ref read on the JS side so a
  // replaced message object never rebuilds the gesture
  const dragX = useSharedValue(0);
  const armed = useSharedValue(false);
  const direction = own ? -1 : 1;
  const messageRef = useRef(message);
  useEffect(() => {
    messageRef.current = message;
  });
  const fireSwipeReply = useCallback(() => onSwipeReply(messageRef.current), [onSwipeReply]);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipeable)
        .activeOffsetX(own ? [-14, 999] : [-999, 14])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const travel = Math.max(0, e.translationX * direction);
          const eased = SWIPE_MAX * (1 - Math.exp(-travel / SWIPE_MAX));
          dragX.value = eased * direction;
          const past = eased >= SWIPE_TRIGGER;
          if (past && !armed.value) runOnJS(haptic)('light');
          armed.value = past;
        })
        .onEnd((_e, success) => {
          if (success && Math.abs(dragX.value) >= SWIPE_TRIGGER) runOnJS(fireSwipeReply)();
        })
        .onFinalize(() => {
          armed.value = false;
          dragX.value = withSpring(0, SWIPE_SPRING);
        }),
    [swipeable, own, direction, fireSwipeReply, dragX, armed],
  );

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }));
  const glyphStyle = useAnimatedStyle(() => {
    const travel = Math.abs(dragX.value);
    return {
      opacity: interpolate(travel, [8, SWIPE_TRIGGER], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(travel, [8, SWIPE_TRIGGER, SWIPE_MAX], [0.5, 1, 1.15], 'clamp') }],
    };
  });
  const glyphDiscStyle = useAnimatedStyle(() => ({
    backgroundColor: armed.value ? colors.brandSoft : colors.surfaceSoft,
  }));


  // Jump-to-quoted lands here with a brand wash that fades out
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!highlighted) return;
    flash.value = 1;
    flash.value = withTiming(0, { duration: 1400 });
  }, [highlighted, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.35 }));


  // Screen readers get the whole row in one node: sender, body,
  // time, delivery state — and every gesture as a named action,
  // since the inner pressables collapse into this one
  const statusLabel =
    message.status === 'failed' ? labels.notSent
    : message.status === 'sending' ? labels.sending
    : message.status === 'read' ? labels.read
    : message.status === 'delivered' ? labels.delivered
    : labels.sent;
  // One formatting / linkify pass per message: the time is shared
  // with ReceiptLine, the segments with MessageText and the link
  // accessibility actions
  const timeText = useMemo(() => formatTime(message.createdAt), [message.createdAt]);
  const segments = useMemo(() => linkify(message.text), [message.text]);
  const links = useMemo(() => segments.filter((seg) => seg.type === 'link'), [segments]);
  const accessibilityLabel = deleted
    ? `${message.senderName}, ${labels.deleted}`
    : `${message.senderName}, ${message.text || labels.photo}, ${timeText}${own && showStatus ? `, ${statusLabel}` : ''}`;
  const accessibilityActions = useMemo<AccessibilityActionInfo[]>(() => {
    if (deleted) return [];
    const list: AccessibilityActionInfo[] = [];
    if (swipeable) list.push({ name: 'reply', label: labels.reply });
    if (actionable) {
      list.push({ name: 'react', label: labels.react });
      if (message.text) list.push({ name: 'copy', label: labels.copy });
      list.push({ name: 'messageActions', label: labels.messageActions });
    }
    if (message.replyTo) list.push({ name: 'jumpToQuoted', label: labels.jumpToQuoted });
    if (message.imageUrl) list.push({ name: 'openPhoto', label: labels.photo });
    links.forEach((link, index) => list.push({ name: `openLink:${index}`, label: `${labels.openLink}: ${link.value}` }));
    if (message.status === 'failed') list.push({ name: 'retry', label: labels.tryAgain });
    return list;
  }, [deleted, actionable, swipeable, message.text, message.replyTo, message.imageUrl, message.status, links, labels]);
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'reply') onSwipeReply(message);
    // Copy and React act directly when the host wired them; the
    // menu stays behind the honestly-named 'Message actions'
    else if (name === 'copy') (onCopy ? onCopy(message) : longPress());
    else if (name === 'react') (onReact ? onReact(message, DEFAULT_REACTION_EMOJI) : longPress());
    else if (name === 'messageActions') longPress();
    else if (name === 'jumpToQuoted') onPressQuote(message);
    else if (name === 'openPhoto') onPressImage(message);
    else if (name === 'retry') onRetry(message);
    else if (name.startsWith('openLink:')) {
      const link = links[Number(name.slice('openLink:'.length))];
      if (link && link.type === 'link') onPressLink(link.href);
    }
  };


  return (
    <Animated.View
      // The inverted native cell mirrors Y, so 'Down' rises there;
      // the upright web list rises with 'Up'
      entering={animateIn ? (isWeb ? FadeInUp.duration(220) : FadeInDown.duration(220)) : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: own ? 'flex-end' : 'flex-start',
        marginTop: tight ? RUN_GAP : BLOCK_GAP,
        marginBottom: hasReactions ? 4 : 0,
        opacity: hidden ? 0 : 1,
      }}
    >

      {/* Reserved avatar column — only the run's last bubble draws
          the portrait, the others keep the column so bubbles align */}
      {avatarSlot !== 'none' ? (
        <View style={{ width: AVATAR_COLUMN, alignItems: 'flex-start' }}>
          {avatarSlot === 'show' ? (
            <KitAvatar uri={message.senderAvatar ? getUploadUrl(message.senderAvatar) : undefined} name={message.senderName} size={AVATAR_SIZE} />
          ) : null}
        </View>
      ) : null}

      <View style={{ maxWidth: BUBBLE_MAX_WIDTH, alignItems: own ? 'flex-end' : 'flex-start' }}>

        {showSender ? (
          <Text
            style={{ marginBottom: 3, marginLeft: BUBBLE_PADDING_H, fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 15, color: colors.inkSoft }}
            numberOfLines={1}
          >
            {message.senderName}
          </Text>
        ) : null}

        <View>
          {/* The reply glyph sits under the bubble's dragged edge and
              is uncovered as the bubble travels */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                ...(own ? { right: 4 } : { left: 4 }),
              },
              glyphStyle,
            ]}
          >
            <Animated.View style={[{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, glyphDiscStyle]}>
              <Ionicons name="arrow-undo" size={18} color={colors.brand} />
            </Animated.View>
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View style={dragStyle}>
              <Pressable
                ref={bodyRef}
                onPress={() => onPress(message)}
                onLongPress={actionable ? longPress : undefined}
                delayLongPress={260}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                // The hint describes what ACTIVATION does (reveal
                // the time); the menu lives behind the named
                // 'Message actions' accessibility action
                accessibilityHint={deleted ? undefined : labels.showTime}
                accessibilityActions={accessibilityActions}
                onAccessibilityAction={onAccessibilityAction}
                style={{ borderRadius: BUBBLE_RADIUS, overflow: 'visible' }}
              >
                <BubbleBody
                  message={message}
                  position={position}
                  labels={labels}
                  segments={segments}
                  onPressQuote={message.replyTo ? () => onPressQuote(message) : undefined}
                  onPressImage={() => onPressImage(message)}
                  onPressLink={onPressLink}
                  onLongPress={actionable ? longPress : undefined}
                  onImageRatio={reportImageRatio}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.accent, ...bubbleRadii(position, own) },
                    flashStyle,
                  ]}
                />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* The tail row: reaction pills hug the bubble's inner
            corner (towards the screen centre, as iMessage and
            Messenger place them); the receipt / time sits on the
            same row at the outer side */}
        {hasReactions || timeRevealed || (showStatus && !deleted) || message.status === 'failed' ? (
          <View
            style={{
              flexDirection: own ? 'row' : 'row-reverse',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              alignSelf: 'stretch',
            }}
          >
            {hasReactions ? (
              <ReactionPills reactions={message.reactions} own={own} label={labels.reactions} onPress={() => onPressReactions(message)} />
            ) : (
              <View />
            )}
            <ReceiptLine message={message} timeText={timeText} labels={labels} showStatus={showStatus && !deleted} showTime={timeRevealed} onRetry={() => onRetry(message)} />
          </View>
        ) : null}

      </View>

    </Animated.View>
  );
}

const MessageBubble = memo(MessageBubbleInner);
export default MessageBubble;
