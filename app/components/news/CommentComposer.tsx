// -----------------------------------------------------------
//  [*] News — CommentComposer
//
//  The pinned comment bar both comment surfaces share: an
//  Input-style multiline TextInput next to a send Button with
//  a loading state. The bar owns its own text/submitting
//  state — the screen only receives the trimmed text through
//  `onSubmit` and answers with a boolean: true means the
//  comment landed and the field clears, false keeps the text
//  so the user can retry after the screen's error toast.
//
//  Logged out the bar degrades to a friendly prompt row with
//  a login button (auth adds features, never gates) that
//  carries the current path WITH its query string as
//  ?returnTo= — a bare pathname would drop ?postId= and land
//  post-login on "post not found". Both variants pad their
//  bottom edge with the safe-area inset while the keyboard is
//  down, so the bar never slides under the home indicator —
//  with the keyboard up the inset is dead space and collapses.
//
//  maxLength 2000 mirrors the backend's MAX_COMMENT_LENGTH
//  (backend/app/news/routes.py) — the old screens capped at
//  an arbitrary 300.
//
//  Split into (root component last):
//
//    COMMENT_MAX_LENGTH      — the backend's comment cap
//    useComposerBottomPadding — keyboard-aware bottom inset
//    LoginPrompt             — logged-out prompt row
//    CommentComposer         — the input bar (default export)
// -----------------------------------------------------------

// Auth state decides which variant renders
import { useAuth } from '@/context/AuthContext';

// The send button and its loading state
import { Button } from '@/components/ui';

// Placeholder color for the active scheme
import { useTheme } from '@/hooks/useTheme';

// Login routing with the params-carrying return href
import { useRouter } from 'expo-router';
import { useReturnHref } from '@/hooks/useReturnHref';

// Bar state and primitives
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Mirrors MAX_COMMENT_LENGTH in backend/app/news/routes.py —
// keep the two in sync so the server never rejects on length
const COMMENT_MAX_LENGTH = 2000;







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
//   - LoginPrompt (below)
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
// LoginPrompt
// -----------------------------------------------------------
//
// The logged-out face of the bar: the loginToComment line
// plus a login button that routes back here after signing in.
// returnTo is the full href — pathname AND query — so a
// ?postId= screen survives the login round-trip.
//
// Used by:
//   - CommentComposer (below)
// -----------------------------------------------------------

function LoginPrompt() {

  const { t } = useTranslation();
  const router = useRouter();
  const returnTo = useReturnHref();
  const paddingBottom = useComposerBottomPadding();


  return (
    <View
      className="flex-row items-center gap-md border-t border-line bg-surface px-md pt-sm"
      style={{ paddingBottom }}
    >
      <Text className="flex-1 font-raleway text-sm text-ink-soft">
        {t('newsPost.loginToComment')}
      </Text>
      <Button
        title={t('settings.login')}
        size="sm"
        fullWidth={false}
        onPress={() => router.push({ pathname: '/login', params: { returnTo } })}
      />
    </View>
  );
}







// -----------------------------------------------------------
// CommentComposer (default export)
// -----------------------------------------------------------
//
//   <CommentComposer onSubmit={async (text) => boolean} />
//     — resolve true to clear the field, false to keep it
//
// Used by:
//   - app/(main)/news-post/index.tsx — below the inline thread
//   - app/(main)/news-comments/index.tsx — below the full thread
// -----------------------------------------------------------

export default function CommentComposer({
  onSubmit,
}: {
  onSubmit: (text: string) => Promise<boolean>;
}) {

  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const paddingBottom = useComposerBottomPadding();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);


  // The ref is the real double-send guard — a second tap can
  // land before setSubmitting's re-render, the ref flips
  // synchronously
  const sendingRef = useRef(false);


  // The screen owns success/failure feedback; the bar only
  // clears on a confirmed success so a failed send is
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


  if (!isAuthenticated) {
    return <LoginPrompt />;
  }


  return (
    <View
      className="flex-row items-end gap-sm border-t border-line bg-surface px-md pt-sm"
      style={{ paddingBottom }}
    >

      {/* Focus flips the border to brand, matching the Input
          kit component this bar is styled after */}
      <TextInput
        className={`flex-1 rounded-md border bg-surface-soft px-md py-sm font-raleway text-base text-ink ${
          focused ? 'border-brand' : 'border-line-strong'
        }`}
        style={{ minHeight: 44, maxHeight: 96, textAlignVertical: 'top' }}
        placeholder={t('newsPost.inputPlaceholder')}
        placeholderTextColor={colors.inkFaint}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={COMMENT_MAX_LENGTH}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={t('newsPost.inputPlaceholder')}
      />

      <Button
        title={t('common.send')}
        onPress={() => void handleSend()}
        loading={submitting}
        disabled={!text.trim()}
        fullWidth={false}
      />

    </View>
  );
}
