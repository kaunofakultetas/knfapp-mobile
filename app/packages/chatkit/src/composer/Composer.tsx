// -----------------------------------------------------------
//  [*] chatkit — Composer
//
//  The message input, Messenger-style: a media button (photo
//  or video) and a paperclip (document) on the left, a rounded
//  pill field that grows with the draft (up to five lines)
//  with the emoji toggle tucked inside its right end, and a
//  send slot that morphs — the quick-like thumb while the
//  field is empty, a brand circle with an up-arrow once there
//  is text, a check while editing — on a short spring. A strip
//  above the field shows who is being answered (or that a
//  message is being edited) and cancels with an ×. The bottom
//  safe area is the composer's to pad.
//
//  Split into (root component last):
//
//    Strip        — the reply / editing bar above the field
//    AttachButton — one of the two attach buttons
//    SendSlot     — the morphing send / like / save button
//    Composer     — the input bar (default export)
// -----------------------------------------------------------

// Theme + labels
import { useKitLabels, useKitTheme } from '../provider';
import { type KitLabels } from '../provider/labels';

// Rendering + motion
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import type { KitMessage, KitReply } from '../core/types';
import { replySnippet } from '../message/ReplyQuote';


// The backend's limit; the counter appears near it. Exported so
// the host's composer hook clamps pasted/emoji input to the same
// number instead of keeping its own copy
export const DEFAULT_MAX_LENGTH = 5000;

// Field growth bounds (one to five lines)
const FIELD_MIN = 38;
const FIELD_MAX = 118;
const MORPH_SPRING = { damping: 18, stiffness: 320, mass: 0.7, overshootClamping: true };

const isWeb = Platform.OS === 'web';







// -----------------------------------------------------------
// Strip
// -----------------------------------------------------------
//
// The bar above the field: "Replying to Ona — <snippet>" or
// "Editing message — <original text>", with a cancel ×.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function Strip({
  icon,
  title,
  snippet,
  accessibilityLabel,
  cancelLabel,
  onCancel,
}: {
  icon: 'arrow-undo' | 'pencil';
  title: string;
  snippet: string;
  accessibilityLabel: string;
  cancelLabel: string;
  onCancel: () => void;
}) {

  const { colors, fonts } = useKitTheme();


  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(120)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginTop: 8,
        paddingLeft: 10,
        paddingRight: 8,
        paddingVertical: 7,
        borderRadius: 12,
        backgroundColor: colors.surfaceSoft,
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand, marginRight: 10 }} />
      <Ionicons name={icon} size={16} color={colors.brand} style={{ marginRight: 8 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, color: colors.brand }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.inkSoft }} numberOfLines={1}>
          {snippet}
        </Text>
      </View>
      <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel={cancelLabel}>
        <Ionicons name="close-circle" size={20} color={colors.inkSoft} />
      </Pressable>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// AttachButton
// -----------------------------------------------------------
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function AttachButton({
  icon,
  label,
  busyLabel,
  busy,
  disabled,
  onPress,
}: {
  icon: 'image-outline' | 'attach-outline';
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {

  const { colors } = useKitTheme();


  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={busy ? busyLabel : label}
      accessibilityState={{ disabled: busy || disabled }}
      style={{ width: 36, height: 38, alignItems: 'center', justifyContent: 'center', opacity: disabled && !busy ? 0.4 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name={icon} size={24} color={colors.brand} />}
    </Pressable>
  );
}







// -----------------------------------------------------------
// SendSlot
// -----------------------------------------------------------
//
// The morphing button: thumb (quick like) ⇄ brand arrow circle
// (send). Both live in the slot; the spring cross-fades and
// scales them so the change never pops.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function SendSlot({
  hasText,
  editing,
  labels,
  onSend,
  onQuickLike,
}: {
  hasText: boolean;
  // Edit mode: the arrow becomes a check and an emptied field
  // cannot save (the thumb never shows)
  editing: boolean;
  labels: KitLabels;
  onSend: () => void;
  onQuickLike: () => void;
}) {

  const { colors } = useKitTheme();


  const sendMode = hasText || editing;
  const mode = useSharedValue(sendMode ? 1 : 0);
  useEffect(() => {
    mode.value = withSpring(sendMode ? 1 : 0, MORPH_SPRING);
  }, [sendMode, mode]);

  const sendStyle = useAnimatedStyle(() => ({
    opacity: mode.value,
    transform: [{ scale: interpolate(mode.value, [0, 1], [0.4, 1]) }],
  }));
  const likeStyle = useAnimatedStyle(() => ({
    opacity: 1 - mode.value,
    transform: [{ scale: interpolate(mode.value, [0, 1], [1, 0.4]) }],
  }));


  return (
    <Pressable
      onPress={() => {
        if (editing && !hasText) return;
        if (!isWeb) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (sendMode) onSend();
        else onQuickLike();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={editing ? labels.saveEdit : hasText ? labels.send : labels.quickLike}
      accessibilityState={{ disabled: editing && !hasText }}
      style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bubbleOut, alignItems: 'center', justifyContent: 'center', opacity: editing && !hasText ? 0.4 : 1 },
          sendStyle,
        ]}
      >
        <Ionicons name={editing ? 'checkmark' : 'arrow-up'} size={20} color={colors.onBrand} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute' }, likeStyle]}>
        <Ionicons name="thumbs-up" size={26} color={colors.brand} />
      </Animated.View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// Composer (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

export default function Composer({
  value,
  onChangeText,
  onSend,
  onQuickLike,
  onAttachMedia,
  onAttachFile,
  onToggleEmoji,
  emojiOpen,
  uploadingMedia,
  uploadingFile = false,
  replyTo,
  onCancelReply,
  editing = null,
  onCancelEdit,
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  // Sends the draft — or saves the edit while `editing` is set
  onSend: () => void;
  onQuickLike: () => void;
  // The media button: a photo or a video from the library
  onAttachMedia: () => void;
  // The paperclip — omitted, the button is not drawn
  onAttachFile?: () => void;
  onToggleEmoji: () => void;
  emojiOpen: boolean;
  uploadingMedia: boolean;
  uploadingFile?: boolean;
  replyTo: KitReply | null;
  onCancelReply: () => void;
  // The message whose text the field holds for editing; the
  // strip shows it and the attach buttons step aside
  editing?: KitMessage | null;
  onCancelEdit?: () => void;
  maxLength?: number;
}) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();
  const insets = useSafeAreaInsets();


  // The home-indicator inset belongs under the bar only while the
  // keyboard is down — with it up, the bar sits flush on the keys
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);


  const limit = maxLength ?? DEFAULT_MAX_LENGTH;
  // What the field visibly shows drives the send morph
  // (Messenger-style) — the send path clears a whitespace-only
  // draft instead of posting, so the thumb never fires under text
  const hasText = value.length > 0;
  const nearLimit = value.length > limit - 200;


  // The field follows its content between one and five lines
  const [fieldHeight, setFieldHeight] = useState(FIELD_MIN);


  // Choosing a reply or starting an edit brings the keyboard up
  // on the field
  const inputRef = useRef<TextInput>(null);
  const replyId = replyTo?.id ?? null;
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (replyId || editingId) inputRef.current?.focus();
  }, [replyId, editingId]);


  // An emptied draft snaps the field back to one line, and on web
  // every change re-measures the textarea with its controlled
  // height released — a floored scrollHeight can never shrink, so
  // without this the field only ever grows
  useEffect(() => {
    if (value.length === 0) {
      setFieldHeight(FIELD_MIN);
      return;
    }
    if (!isWeb) return;
    const node = inputRef.current as unknown as { style?: { height: string }; scrollHeight?: number } | null;
    if (!node?.style || typeof node.scrollHeight !== 'number') return;
    const previous = node.style.height;
    node.style.height = '0px';
    const next = Math.min(FIELD_MAX, Math.max(FIELD_MIN, Math.ceil(node.scrollHeight)));
    node.style.height = previous;
    setFieldHeight((current) => (Math.abs(current - next) > 1 ? next : current));
  }, [value]);


  // Hardware / web keyboards: Enter sends, Shift+Enter breaks a
  // line, and Enter that confirms an IME composition is left
  // alone. The default is only suppressed when the key is
  // consumed — same emptiness rule as the send button
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (!isWeb || e.nativeEvent.key !== 'Enter') return;
    const native = e.nativeEvent as unknown as { shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
    if (native.shiftKey || native.isComposing || native.keyCode === 229) return;
    if (!hasText) return;
    e.preventDefault();
    onSend();
  };


  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingBottom: keyboardUp ? 0 : insets.bottom,
      }}
    >

      {editing ? (
        <Strip
          icon="pencil"
          title={labels.editingMessage}
          snippet={editing.text}
          accessibilityLabel={labels.editingMessage}
          cancelLabel={labels.cancelEdit}
          onCancel={() => onCancelEdit?.()}
        />
      ) : replyTo ? (
        <Strip
          icon="arrow-undo"
          title={replyTo.senderName}
          snippet={replySnippet(replyTo, labels)}
          accessibilityLabel={labels.replyingTo(replyTo.senderName)}
          cancelLabel={labels.cancelReply}
          onCancel={onCancelReply}
        />
      ) : null}

      {nearLimit ? (
        <Text style={{ paddingHorizontal: 16, paddingTop: 6, textAlign: 'right', fontFamily: fonts.regular, fontSize: 11, color: colors.inkFaint }}>
          {value.length}/{limit}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8 }}>

        {/* Attachments make no sense while editing a text — the
            buttons dim instead of vanishing, so the bar keeps its shape */}
        <AttachButton
          icon="image-outline"
          label={labels.attachMedia}
          busyLabel={labels.uploadingMedia}
          busy={uploadingMedia}
          disabled={!!editing}
          onPress={onAttachMedia}
        />
        {onAttachFile ? (
          <AttachButton
            icon="attach-outline"
            label={labels.attachFile}
            busyLabel={labels.uploadingFile}
            busy={uploadingFile}
            disabled={!!editing}
            onPress={onAttachFile}
          />
        ) : null}

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginHorizontal: 6,
            borderRadius: 20,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          <TextInput
            ref={inputRef}
            onKeyPress={onKeyPress}
            style={{
              // The pill is the focus affordance; drop the browser ring
              ...(isWeb ? ({ outlineStyle: 'none' } as object) : {}),
              flex: 1,
              height: fieldHeight,
              paddingLeft: 14,
              paddingRight: 4,
              paddingTop: 9,
              paddingBottom: 9,
              fontFamily: fonts.regular,
              fontSize: 16,
              lineHeight: 20,
              color: colors.ink,
            }}
            value={value}
            onChangeText={onChangeText}
            onContentSizeChange={(e) => {
              const next = Math.min(FIELD_MAX, Math.max(FIELD_MIN, Math.ceil(e.nativeEvent.contentSize.height)));
              setFieldHeight((current) => (Math.abs(current - next) > 1 ? next : current));
            }}
            placeholder={labels.inputPlaceholder}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={labels.inputPlaceholder}
            multiline
            maxLength={limit}
            textAlignVertical="center"
          />
          <Pressable
            onPress={onToggleEmoji}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={labels.chooseEmoji}
            accessibilityState={{ expanded: emojiOpen }}
            style={{ width: 36, height: FIELD_MIN, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={emojiOpen ? 'happy' : 'happy-outline'} size={22} color={emojiOpen ? colors.brand : colors.inkSoft} />
          </Pressable>
        </View>

        <SendSlot hasText={hasText} editing={!!editing} labels={labels} onSend={onSend} onQuickLike={onQuickLike} />

      </View>

    </View>
  );
}
