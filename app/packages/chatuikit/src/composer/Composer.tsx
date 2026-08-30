// -----------------------------------------------------------
//  [*] chatuikit — Composer
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
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import KitAvatar from '../avatar/KitAvatar';
import { formatDuration } from '../core/media';
import type { KitMentionCandidate, KitMessage, KitReply } from '../core/types';
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
  icon: 'image-outline' | 'attach-outline' | 'mic-outline';
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

// Case- and diacritic-insensitive match key for the mention
// strip's filtering (mirrors core/linkify's fold)
const foldName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();







// -----------------------------------------------------------
// MentionStrip
// -----------------------------------------------------------
//
// The horizontal row of members above the field while the
// draft ends in an "@partial" token: portrait + name, a tap
// replaces the token with the full "@Name ". Taps must land
// with the keyboard up, hence keyboardShouldPersistTaps.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function MentionStrip({ candidates, labels, onPick }: { candidates: KitMentionCandidate[]; labels: KitLabels; onPick: (name: string) => void }) {

  const { colors, fonts } = useKitTheme();


  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={{ borderTopWidth: 1, borderTopColor: colors.line }}
      contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}
      testID="chatuikit-mentions"
    >
      {candidates.map((candidate) => (
        <Pressable
          key={candidate.id}
          onPress={() => onPick(candidate.name)}
          accessibilityRole="button"
          accessibilityLabel={labels.mentionUser(candidate.name)}
          testID={`chatuikit-mention-pick-${candidate.id}`}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: colors.surfaceSoft }}
        >
          <KitAvatar uri={candidate.avatarUrl} name={candidate.name} size={22} colorKey={candidate.id} />
          <Text style={{ marginLeft: 6, fontFamily: fonts.medium, fontSize: 14, color: colors.ink }}>{candidate.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// RecordingRow
// -----------------------------------------------------------
//
// The bar while a voice note records: the red dot, the elapsed
// time, cancel (discards the take) and the brand send button
// (stops and sends). It replaces the WHOLE composer row, so
// nothing else can be tapped mid-take.
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function RecordingRow({ elapsedSeconds, labels, onCancel, onStop }: { elapsedSeconds: number; labels: KitLabels; onCancel: () => void; onStop: () => void }) {

  const { colors, fonts } = useKitTheme();


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 }} testID="chatuikit-recording">
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
      <Text
        accessibilityLiveRegion="polite"
        style={{ marginLeft: 8, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] }}
      >
        {formatDuration(elapsedSeconds)}
      </Text>
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={labels.cancelRecording}
        testID="chatuikit-recording-cancel"
        style={{ padding: 8, marginRight: 10 }}
      >
        <Ionicons name="trash-outline" size={22} color={colors.inkSoft} />
      </Pressable>
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel={labels.sendVoice}
        testID="chatuikit-recording-send"
        style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}







function SendSlot({
  hasText,
  editing,
  disabled = false,
  labels,
  onSend,
  onQuickLike,
}: {
  hasText: boolean;
  // Edit mode: the arrow becomes a check and an emptied field
  // cannot save (the thumb never shows)
  editing: boolean;
  // A guest's slot: drawn dimmed, inert
  disabled?: boolean;
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
        if (disabled || (editing && !hasText)) return;
        if (!isWeb) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (sendMode) onSend();
        else onQuickLike();
      }}
      hitSlop={6}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={editing ? labels.saveEdit : hasText ? labels.send : labels.quickLike}
      accessibilityState={{ disabled: disabled || (editing && !hasText) }}
      testID="chatuikit-send"
      style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
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
  canSend = true,
  textInputProps,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  recording = null,
  mentionCandidates = null,
  onAttachCamera,
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
  // The message whose text the field holds for editing (any
  // message-like value with an id and text — the engine's
  // EditTarget fits); the strip shows it and the attach buttons
  // step aside
  editing?: Pick<KitMessage, 'id' | 'text'> | null;
  onCancelEdit?: () => void;
  maxLength?: number;
  // False for a reader who may not send (a guest): the field and
  // the buttons disable and a strip says why. Default true
  canSend?: boolean;
  // Escape hatch: extra TextInput props (autoFocus, testID,
  // autoCapitalize…); the kit's own props win where they overlap
  textInputProps?: Partial<TextInputProps>;
  // Voice notes — recording is the HOST's (permission, the
  // recorder); the kit only draws. With onStartRecording the mic
  // button appears; while `recording` the whole row swaps for the
  // recording bar
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onCancelRecording?: () => void;
  recording?: { elapsedSeconds: number } | null;
  // The room's members for @-completion — omitted, no strip
  mentionCandidates?: KitMentionCandidate[] | null;
  // The camera shortcut inside the field (drawn while the field
  // is empty) — omitted, no button
  onAttachCamera?: () => void;
}) {

  const labels = useKitLabels();
  const { colors, fonts, scheme } = useKitTheme();
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


  // A rotation moves the field: the keyboard is dismissed so it
  // never covers the composer at its new position
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let landscape = Dimensions.get('window').width > Dimensions.get('window').height;
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      const next = window.width > window.height;
      if (next !== landscape) {
        landscape = next;
        Keyboard.dismiss();
      }
    });
    return () => sub.remove();
  }, []);


  const limit = maxLength ?? DEFAULT_MAX_LENGTH;
  // What the field visibly shows drives the send morph
  // (Messenger-style) — the send path clears a whitespace-only
  // draft instead of posting, so the thumb never fires under text
  const hasText = value.length > 0;
  const nearLimit = value.length > limit - 200;


  // The field follows its content between one and five lines
  const [fieldHeight, setFieldHeight] = useState(FIELD_MIN);


  // The cursor, for the mention strip: the active token is the
  // "@partial" ending exactly at the cursor. Selection events
  // lag a controlled value by a beat, so the position is clamped
  // to the current text
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  const mentionQuery = useMemo(() => {
    if (!mentionCandidates?.length || editing) return null;
    const at = Math.min(cursorPos ?? value.length, value.length);
    const head = value.slice(0, at);
    const token = head.match(/(^|\s)@([^\s@]{0,30})$/);
    return token ? token[2] : null;
  }, [mentionCandidates, editing, cursorPos, value]);
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null || !mentionCandidates) return [];
    const query = foldName(mentionQuery);
    const starts = mentionCandidates.filter((c) => foldName(c.name).startsWith(query));
    const contains = query ? mentionCandidates.filter((c) => !foldName(c.name).startsWith(query) && foldName(c.name).includes(query)) : [];
    return [...starts, ...contains].slice(0, 5);
  }, [mentionQuery, mentionCandidates]);
  const insertMention = (name: string) => {
    const at = Math.min(cursorPos ?? value.length, value.length);
    const head = value.slice(0, at).replace(/@[^\s@]{0,30}$/, `@${name} `);
    onChangeText(head + value.slice(at));
    setCursorPos(head.length);
  };


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
    // Read at call time (not the module constant) so a host can
    // run the web rule in tests that flip Platform.OS
    if (Platform.OS !== 'web' || e.nativeEvent.key !== 'Enter') return;
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

      {!canSend ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surfaceSoft }} accessibilityRole="text" testID="chatuikit-composer-locked">
          <Ionicons name="lock-closed-outline" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.inkSoft }}>{labels.signInToChat}</Text>
        </View>
      ) : editing ? (
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

      {mentionMatches.length > 0 && !recording ? (
        <MentionStrip candidates={mentionMatches} labels={labels} onPick={insertMention} />
      ) : null}

      {recording && canSend ? (
        <RecordingRow
          elapsedSeconds={recording.elapsedSeconds}
          labels={labels}
          onCancel={() => onCancelRecording?.()}
          onStop={() => onStopRecording?.()}
        />
      ) : (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8 }}>

        {/* Attachments make no sense while editing a text — the
            buttons dim instead of vanishing, so the bar keeps its shape */}
        <AttachButton
          icon="image-outline"
          label={labels.attachMedia}
          busyLabel={labels.uploadingMedia}
          busy={uploadingMedia}
          disabled={!!editing || !canSend}
          onPress={onAttachMedia}
        />
        {onAttachFile ? (
          <AttachButton
            icon="attach-outline"
            label={labels.attachFile}
            busyLabel={labels.uploadingFile}
            busy={uploadingFile}
            disabled={!!editing || !canSend}
            onPress={onAttachFile}
          />
        ) : null}
        {onStartRecording ? (
          <AttachButton
            icon="mic-outline"
            label={labels.recordVoice}
            busyLabel={labels.recordVoice}
            busy={false}
            disabled={!!editing || !canSend}
            onPress={onStartRecording}
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
            {...textInputProps}
            ref={inputRef}
            onSelectionChange={(e) => {
              setCursorPos(e.nativeEvent.selection.end);
              textInputProps?.onSelectionChange?.(e);
            }}
            onKeyPress={onKeyPress}
            editable={canSend && (textInputProps?.editable ?? true)}
            keyboardAppearance={scheme}
            testID={textInputProps?.testID ?? 'chatuikit-composer-input'}
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
          {onAttachCamera && !hasText && !editing ? (
            <Pressable
              onPress={onAttachCamera}
              hitSlop={6}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={labels.attachCamera}
              testID="chatuikit-camera"
              style={{ width: 34, height: FIELD_MIN, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="camera-outline" size={22} color={colors.inkSoft} />
            </Pressable>
          ) : null}
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

        <SendSlot hasText={hasText} editing={!!editing} disabled={!canSend} labels={labels} onSend={onSend} onQuickLike={onQuickLike} />

      </View>
      )}

    </View>
  );
}
