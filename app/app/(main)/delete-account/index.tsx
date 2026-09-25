// -----------------------------------------------------------
//  [*] Delete account — password-confirmed erasure
//
//  The self-service GDPR path: a plain warning of what the
//  backend will do (anonymise the row, tombstone posts, delete
//  everything personal), a current-password field, and one
//  destructive button behind a second confirm. Success tears
//  the local session down — the server already deleted every
//  session as part of the erasure — and lands on the settings
//  tab as a guest. A wrong password is named as such; the
//  last-active-admin refusal and the attempt budget get their
//  own lines so the screen never shrugs with a generic error —
//  told apart by the backend's machine codes, never by its
//  English prose — and a lost connection says so.
//
//  One erasure per intent: a second tap while the confirm or
//  the request is pending is ignored (two stacked confirms
//  used to fire two erasures, the second answering 401), and
//  the form stays on screen through the sign-out that follows
//  success instead of flashing the signed-out empty state.
//
//  Reached only from settings while signed in; a logged-out
//  visit renders the empty state instead of a doomed form.
//
//  Split into:
//
//    errorKey            — failure → the line under the field
//    DeleteAccountScreen — the form (default export)
// -----------------------------------------------------------

// UI kit — form controls, states, the confirm dialog
import { Button, EmptyState, Input, Screen, confirmAction } from '@/components/ui';

// Session teardown and toasts
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// Keyboard-aware bottom padding
import useKeyboardVisible from '@/hooks/useKeyboardVisible';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The erasure call and the normalized error shape
import { ApiError, deleteAccountApi } from '@/services/api';

// Navigation, i18n and primitives
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';







// -----------------------------------------------------------
// errorKey
// -----------------------------------------------------------
//
// The one line a failed erasure shows under the password: the
// backend's overloaded 400 read apart by its machine code
// (invalid_credentials vs last_admin — a server predating the
// last_admin code is still recognised by its message), the
// 429 attempt budget, a lost connection or timeout in the
// catalog's own words, and the generic line for the rest.
//
// Used by:
//   - DeleteAccountScreen (below)
// -----------------------------------------------------------

function errorKey(err: unknown): string {

  if (!(err instanceof ApiError)) return 'deleteAccount.error';


  if (err.status === 429) return 'deleteAccount.tooMany';
  if (err.serverCode === 'invalid_credentials') return 'deleteAccount.wrongPassword';
  if (err.serverCode === 'last_admin') return 'deleteAccount.lastAdmin';
  if (err.status === 400) {
    return /admin/i.test(err.message) ? 'deleteAccount.lastAdmin' : 'deleteAccount.wrongPassword';
  }
  if (err.code === 'network') return 'errors.network';
  if (err.code === 'timeout') return 'errors.timeout';
  return 'deleteAccount.error';
}







// -----------------------------------------------------------
// DeleteAccountScreen (default export)
// -----------------------------------------------------------
//
// Owns password / error / busy (+ the done latch that keeps
// the form up through the sign-out). handleDelete runs
// confirm → API → logout → replace behind a synchronous
// in-flight ref, mapping failures through errorKey; the
// KeyboardAvoidingView is the screen ROOT on purpose — nested
// deeper its frame comes up short and buries the button.
//
// Used by:
//   - app/(main)/_layout.tsx — route /delete-account
//   - app/(main)/tabs/settings.tsx — the danger link
// -----------------------------------------------------------

export default function DeleteAccountScreen() {

  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();


  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);


  // Set once the erasure succeeded — the sign-out that follows
  // flips isAuthenticated, and the form must not give way to
  // the signed-out empty state for the frames before the replace
  const [done, setDone] = useState(false);


  // Synchronous in-flight latch across the confirm AND the
  // request — `busy` only lands after a re-render, and a
  // second tap in between stacked a second confirm
  const inFlightRef = useRef(false);


  // Confirm, call, tear down (see errorKey for the failures)
  const handleDelete = async () => {
    if (inFlightRef.current) return;
    if (!password) {
      setError(t('deleteAccount.passwordRequired'));
      return;
    }
    inFlightRef.current = true;

    try {
      const confirmed = await confirmAction({
        title: t('deleteAccount.confirmTitle'),
        message: t('deleteAccount.confirmMessage'),
        confirmLabel: t('deleteAccount.submit'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      setBusy(true);
      setError(null);
      try {
        await deleteAccountApi(password);
      } catch (err) {
        setError(t(errorKey(err)));
        setBusy(false);
        return;
      }

      setDone(true);
      showToast('success', t('deleteAccount.done'));
      await logout();
      router.replace('/(main)/tabs/settings');
    } finally {
      inFlightRef.current = false;
    }
  };


  if (!isAuthenticated && !done) {
    return (
      <Screen>
        <EmptyState icon="person-circle-outline" title={t('profile.notFound')} />
      </Screen>
    );
  }


  return (
    // The KeyboardAvoidingView is the screen ROOT on purpose:
    // nested inside a SafeAreaView its frame comes up short by
    // the header and the home indicator, and the button ends up
    // behind the keys (see new-chat). The bottom inset is padded
    // inside, only while the keyboard is down
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-md pt-lg"
          contentContainerStyle={{ paddingBottom: keyboardUp ? 24 : insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >

          <Text className="font-raleway-bold text-lg text-ink">{t('deleteAccount.title')}</Text>
          <Text className="mb-lg mt-sm font-raleway text-sm leading-5 text-ink-soft">
            {t('deleteAccount.warning')}
          </Text>

          <Input
            label={t('deleteAccount.passwordLabel')}
            placeholder={t('deleteAccount.passwordPlaceholder')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => void handleDelete()}
          />

          <View className="mt-md">
            <Button
              title={t('deleteAccount.submit')}
              variant="danger"
              onPress={() => void handleDelete()}
              loading={busy}
            />
          </View>

        </ScrollView>
    </KeyboardAvoidingView>
  );
}
