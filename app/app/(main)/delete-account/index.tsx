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
//  own lines so the screen never shrugs with a generic error.
//
//  Reached only from settings while signed in; a logged-out
//  visit renders the empty state instead of a doomed form.
//
//  Split into:
//
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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';







// -----------------------------------------------------------
// DeleteAccountScreen (default export)
// -----------------------------------------------------------
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


  // Confirm, call, tear down. The backend's 400 carries two
  // meanings — wrong password or last-admin refusal — told
  // apart by its message; 429 is the shared attempt budget
  const handleDelete = async () => {
    if (!password) {
      setError(t('deleteAccount.passwordRequired'));
      return;
    }

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
      showToast('success', t('deleteAccount.done'));
      await logout();
      router.replace('/(main)/tabs/settings');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t('deleteAccount.tooMany'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(
          /admin/i.test(err.message)
            ? t('deleteAccount.lastAdmin')
            : t('deleteAccount.wrongPassword'),
        );
      } else {
        setError(t('deleteAccount.error'));
      }
    } finally {
      setBusy(false);
    }
  };


  if (!isAuthenticated) {
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
