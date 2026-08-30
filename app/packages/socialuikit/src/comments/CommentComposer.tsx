// -----------------------------------------------------------
//  [*] socialuikit — CommentComposer
//
//  The pinned comment bar under a thread: a multiline field
//  next to a round send button with a busy spinner. The bar
//  owns its own text/submitting state — the host only receives
//  the trimmed text through `onSubmit` and answers with a
//  boolean: true means the comment landed and the field
//  clears, false keeps the text so the reader can retry after
//  the host's error toast. A whitespace-only draft never
//  submits, and a second tap mid-flight is swallowed.
//
//  Signed out (canComment false) the bar degrades to a
//  friendly prompt row with a sign-in button — auth adds
//  features, never gates reading the thread. Both variants pad
//  their bottom edge with the safe-area inset while the
//  keyboard is down, so the bar never slides under the home
//  indicator — with the keyboard up the inset is dead space
//  and collapses.
//
//  Split into (root component last):
//
//    DEFAULT_MAX_LENGTH       — the default comment cap
//    useComposerBottomPadding — keyboard-aware bottom inset
//    SignInPrompt             — the signed-out prompt row
//    CommentComposer          — the input bar (default export)
// -----------------------------------------------------------

// Theme + labels
import { useKitLabels, useKitTheme } from '../provider';

// Bar state and primitives
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Matches the faculty backend's comment cap; a host with
// another contract passes its own maxLength
const DEFAULT_MAX_LENGTH = 2000;







// -----------------------------------------------------------
// useComposerBottomPadding
// -----------------------------------------------------------
//
// The bar's bottom padding: the home-indicator inset while the
// keyboard is down, a plain 8 while it is up — the keyboard
// covers the indicator, so keeping the inset would leave a
// dead strip between the input and the keys (iOS). The Will*
// events fire only on iOS; Android answers to Did*.
//
// Used by:
//   - SignInPrompt (below)
//   - CommentComposer (below)
// -----------------------------------------------------------

function useComposerBottomPadding(): number {

  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);


  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);


  return keyboardUp ? 8 : Math.max(insets.bottom, 8);
}







// -----------------------------------------------------------
// SignInPrompt
// -----------------------------------------------------------
//
// The signed-out face of the bar: the signInToComment line
// plus a sign-in button. Where signing in leads (and how the
// reader gets back to this thread afterwards) is the host's
// onPressSignIn to decide — the kit never routes.
//
// Used by:
//   - CommentComposer (below)
// -----------------------------------------------------------

function SignInPrompt({ onPressSignIn }: { onPressSignIn?: () => void }) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  const paddingBottom = useComposerBottomPadding();


  return (
    <View
      testID="socialuikit-comment-locked"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom,
      }}
    >

      <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft }}>
        {labels.signInToComment}
      </Text>

      <Pressable
        onPress={() => onPressSignIn?.()}
        accessibilityRole="button"
        accessibilityLabel={labels.signIn}
        style={{
          marginLeft: 10,
          borderRadius: radii.pill,
          backgroundColor: colors.brand,
          paddingHorizontal: 14,
          paddingVertical: 7,
        }}
      >
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.onBrand }}>{labels.signIn}</Text>
      </Pressable>

    </View>
  );
}







// -----------------------------------------------------------
// CommentComposer (default export)
// -----------------------------------------------------------
//
//   <CommentComposer canComment={!!user}
//                    onSubmit={async (text) => boolean}
//                    onPressSignIn={openLogin} />
//     — resolve true to clear the field, false to keep it
//
// Used by:
//   - src/index.ts — the public surface; hosts pin one under
//     a post's comment thread
// -----------------------------------------------------------

export default function CommentComposer({
  canComment,
  onSubmit,
  onPressSignIn,
  maxLength = DEFAULT_MAX_LENGTH,
  autoFocus = false,
}: {
  // False renders the sign-in prompt instead of the field
  canComment: boolean;
  // Receives the TRIMMED draft; the boolean decides the clear
  onSubmit: (text: string) => Promise<boolean>;
  onPressSignIn?: () => void;
  maxLength?: number;
  autoFocus?: boolean;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  const paddingBottom = useComposerBottomPadding();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);


  // The ref is the real double-send guard — a second tap can
  // land before setSubmitting's re-render; the ref flips
  // synchronously
  const sendingRef = useRef(false);


  // The host owns success/failure feedback; the bar only
  // clears on a confirmed success, so a failed send is
  // retryable without retyping
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;

    sendingRef.current = true;
    setSubmitting(true);
    try {
      const delivered = await onSubmit(trimmed);
      if (delivered) setText('');
    } finally {
      sendingRef.current = false;
      setSubmitting(false);
    }
  };


  if (!canComment) {
    return <SignInPrompt onPressSignIn={onPressSignIn} />;
  }


  const hasDraft = text.trim().length > 0;


  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom,
      }}
    >

      {/* Focus flips the border to brand — the field's only
          focus affordance */}
      <TextInput
        testID="socialuikit-comment-input"
        style={{
          flex: 1,
          minHeight: 40,
          maxHeight: 96,
          borderWidth: 1,
          borderColor: focused ? colors.brand : colors.line,
          borderRadius: radii.chip,
          backgroundColor: colors.bg,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontFamily: fonts.regular,
          fontSize: 15,
          color: colors.ink,
          textAlignVertical: 'top',
        }}
        placeholder={labels.commentPlaceholder}
        placeholderTextColor={colors.inkFaint}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={maxLength}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={labels.commentPlaceholder}
      />

      <Pressable
        testID="socialuikit-comment-send"
        onPress={() => void handleSend()}
        disabled={submitting || !hasDraft}
        accessibilityRole="button"
        accessibilityLabel={labels.commentSend}
        accessibilityState={{ disabled: submitting || !hasDraft, busy: submitting }}
        style={{
          marginLeft: 8,
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hasDraft || submitting ? 1 : 0.4,
        }}
      >
        {submitting ? (
          <ActivityIndicator size="small" color={colors.onBrand} />
        ) : (
          <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
        )}
      </Pressable>

    </View>
  );
}
