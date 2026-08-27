// -----------------------------------------------------------
//  [*] chatkit — Composer
//
//  The message input, Messenger-style: a photo button on the
//  left, a rounded pill field that grows with the draft (up to
//  five lines) with the emoji toggle tucked inside its right
//  end, and a send slot that morphs — the quick-like thumb
//  while the field is empty, a brand circle with an up-arrow
//  once there is text — on a short spring. A reply strip above
//  the field shows who is being answered and cancels with an
//  ×. The bottom safe area is the composer's to pad.
//
//  Split into (root component last):
//
//    ReplyStrip  — the quoted-message bar
//    SendSlot    — the morphing send / like button
//    Composer    — the input bar (default export)
// -----------------------------------------------------------

// Theme + labels
import { useTheme } from '@/hooks/useTheme';
import { useKitLabels } from './labels';

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

import { fonts } from '@/constants/theme';

import type { KitReply } from './types';


// The backend's limit; the counter appears near it
const DEFAULT_MAX_LENGTH = 5000;

// Field growth bounds (one to five lines)
const FIELD_MIN = 38;
const FIELD_MAX = 118;
const MORPH_SPRING = { damping: 18, stiffness: 320, mass: 0.7, overshootClamping: true };

const isWeb = Platform.OS === 'web';







// -----------------------------------------------------------
// ReplyStrip
// -----------------------------------------------------------
//
// Used by:
//   - Composer (below)
// -----------------------------------------------------------

function ReplyStrip({ reply, onCancel }: { reply: KitReply; onCancel: () => void }) {

  const labels = useKitLabels();
  const { colors } = useTheme();


  const snippet = reply.deleted ? labels.deleted : reply.text || (reply.imageUrl ? labels.photo : '');


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
      accessibilityLabel={labels.replyingTo(reply.senderName)}
    >
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.brand, marginRight: 10 }} />
      <Ionicons name="arrow-undo" size={16} color={colors.brand} style={{ marginRight: 8 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, color: colors.brand }} numberOfLines={1}>
          {reply.senderName}
        </Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 16, color: colors.inkSoft }} numberOfLines={1}>
          {snippet}
        </Text>
      </View>
      <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={labels.cancelReply}>
        <Ionicons name="close-circle" size={20} color={colors.inkSoft} />
      </Pressable>
    </Animated.View>
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

function SendSlot({ hasText, onSend, onQuickLike }: { hasText: boolean; onSend: () => void; onQuickLike: () => void }) {

  const labels = useKitLabels();
  const { colors } = useTheme();


  const mode = useSharedValue(hasText ? 1 : 0);
  useEffect(() => {
    mode.value = withSpring(hasText ? 1 : 0, MORPH_SPRING);
  }, [hasText, mode]);

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
        if (!isWeb) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (hasText) onSend();
        else onQuickLike();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={hasText ? labels.send : labels.quickLike}
      style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bubbleOut, alignItems: 'center', justifyContent: 'center' },
          sendStyle,
        ]}
      >
        <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
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
  onAttachImage,
  onToggleEmoji,
  emojiOpen,
  uploadingImage,
  replyTo,
  onCancelReply,
  maxLength,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onQuickLike: () => void;
  onAttachImage: () => void;
  onToggleEmoji: () => void;
  emojiOpen: boolean;
  uploadingImage: boolean;
  replyTo: KitReply | null;
  onCancelReply: () => void;
  maxLength?: number;
}) {

  const labels = useKitLabels();
  const { colors } = useTheme();
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
  const hasText = value.trim().length > 0;
  const nearLimit = value.length > limit - 200;


  // The field follows its content between one and five lines
  const [fieldHeight, setFieldHeight] = useState(FIELD_MIN);


  // Choosing a reply brings the keyboard up on the field
  const inputRef = useRef<TextInput>(null);
  const replyId = replyTo?.id ?? null;
  useEffect(() => {
    if (replyId) inputRef.current?.focus();
  }, [replyId]);


  // Hardware / web keyboards: Enter sends, Shift+Enter breaks a
  // line, and Enter that confirms an IME composition is left alone
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (!isWeb || e.nativeEvent.key !== 'Enter') return;
    const native = e.nativeEvent as unknown as { shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
    if (native.shiftKey || native.isComposing || native.keyCode === 229) return;
    e.preventDefault();
    if (hasText) onSend();
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

      {replyTo ? <ReplyStrip reply={replyTo} onCancel={onCancelReply} /> : null}

      {nearLimit ? (
        <Text style={{ paddingHorizontal: 16, paddingTop: 6, textAlign: 'right', fontFamily: fonts.regular, fontSize: 11, color: colors.inkFaint }}>
          {value.length}/{limit}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8 }}>

        <Pressable
          onPress={onAttachImage}
          disabled={uploadingImage}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={uploadingImage ? labels.uploadingPhoto : labels.attachPhoto}
          accessibilityState={{ disabled: uploadingImage }}
          style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
        >
          {uploadingImage ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <Ionicons name="image-outline" size={24} color={colors.brand} />
          )}
        </Pressable>

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

        <SendSlot hasText={hasText} onSend={onSend} onQuickLike={onQuickLike} />

      </View>

    </View>
  );
}
