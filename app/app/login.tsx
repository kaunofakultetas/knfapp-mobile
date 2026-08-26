// -----------------------------------------------------------
//  [*] Auth — Login
//
//  The app's front door: ONE route with two state-driven
//  steps (the old Swiper dependency is gone). 'welcome' is
//  the burgundy brand pitch — logo, tagline, a Continue
//  button that advances to the form and an underlined guest
//  skip — and 'login' is the credential form under a brand
//  top bar. Returning users (the stored 'onboarded' flag) and
//  LoginRequiredOverlay arrivals (?returnTo=) start on the
//  form directly; the bar's back arrow returns to the pitch.
//
//  A successful login writes 'onboarded' BEFORE navigating —
//  index.tsx's cold-start redirect reads that flag, and
//  skipping the write used to bounce signed-in users back to
//  onboarding on every launch. The redirect then honors
//  ?returnTo so overlay users land back where they were.
//
//  Server failures surface INLINE above the form, not only as
//  a toast: 'http' errors show the backend's own message,
//  'timeout' and 'network' resolve to translated sentinels —
//  the api layer stays language-free.
//
//  Split into (root component last):
//
//    errorText   — failure → display text mapping
//    FormTopBar  — brand top bar with the back affordance
//    WelcomeStep — the burgundy brand pitch
//    ErrorBanner — inline server-error box above the form
//    LoginStep   — the credential form
//    LoginScreen — step state + onboarded gate (default export)
// -----------------------------------------------------------

// UI kit and theming
import { Button, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Auth action and the normalized API error shape
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/api';

// Navigation and the persisted onboarded flag
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// The brand mark on the welcome step
import LogoKnF from '../components/logoknf.svg';

// Field values — the shared domain shape
import type { LoginForm } from '@/types';


// The welcome pitch offers the guest skip next to Continue
interface WelcomeStepProps {
  onContinue: () => void;
  onGuest: () => void;
}

// returnTo arrives from LoginRequiredOverlay's ?returnTo= push
interface LoginStepProps {
  returnTo?: string;
  onBack: () => void;
  onGuest: () => void;
}







// -----------------------------------------------------------
// errorText
// -----------------------------------------------------------
//
// Maps a failed login onto display text. 'http' failures keep
// the backend's own message (wrong password reads differently
// from a disabled account); 'timeout' and 'network' arrive as
// sentinel codes because the api layer is language-free, so
// they translate here.
//
// Used by:
//   - LoginStep (below)
// -----------------------------------------------------------

function errorText(err: unknown, t: TFunction): string {

  if (err instanceof ApiError && err.code === 'http') {
    return err.message || t('login.errorMessage');
  }


  return err instanceof ApiError && err.code === 'timeout'
    ? t('toast.timeout')
    : t('toast.networkError');
}







// -----------------------------------------------------------
// FormTopBar
// -----------------------------------------------------------
//
// The burgundy band above the credential form — it keeps the
// app-wide "brand top on every screen" invariant the root
// layout's light StatusBar relies on, and carries the back
// arrow to the welcome step (the flow is one route, so back
// is state, not navigation).
//
// Used by:
//   - LoginStep (below)
// -----------------------------------------------------------

function FormTopBar({ title, onBack }: { title: string; onBack: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <SafeAreaView edges={['top']} className="bg-brand-header">
      <View className="flex-row items-center px-md" style={{ paddingVertical: 10 }}>

        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="arrow-back" size={24} color={colors.onBrand} />
        </Pressable>

        <Text className="ml-sm flex-1 font-raleway-bold text-xl text-on-brand">{title}</Text>
      </View>
    </SafeAreaView>
  );
}







// -----------------------------------------------------------
// WelcomeStep
// -----------------------------------------------------------
//
// The first-run pitch on full-bleed burgundy: the faculty
// mark, the tagline, Continue into the credential form and
// the underlined guest skip. Continue only advances the step —
// 'onboarded' is written by an actual outcome (login, register
// or the guest skip), never by merely seeing this page.
//
// Used by:
//   - LoginScreen (below)
// -----------------------------------------------------------

function WelcomeStep({ onContinue, onGuest }: WelcomeStepProps) {

  const { t } = useTranslation();


  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-brand">

      {/* The mark floats in the free upper space */}
      <View className="flex-1 items-center justify-center">
        <LogoKnF width={180} height={260} />
      </View>

      <View className="w-full items-center px-lg pb-xl">

        <Text className="text-center font-raleway-bold text-2xl text-on-brand">
          {t('login.welcomeTitle')}
        </Text>

        <Text className="mt-md text-center font-raleway text-base leading-6 text-on-brand opacity-80">
          {t('login.subtitle')}
        </Text>

        {/* The ui Button has no white-on-burgundy variant, so
            the brand-screen CTA is its own pressable */}
        <Pressable
          onPress={onContinue}
          className="mt-xl h-14 w-full items-center justify-center rounded-full bg-surface"
          style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          accessibilityRole="button"
          accessibilityLabel={t('login.continue')}
        >
          <Text className="font-raleway-bold text-lg text-brand">{t('login.continue')}</Text>
        </Pressable>

        <Pressable
          onPress={onGuest}
          className="mt-md py-sm"
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={t('login.continueAsGuest')}
        >
          <Text className="text-center font-raleway text-base text-on-brand underline opacity-80">
            {t('login.continueAsGuest')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}







// -----------------------------------------------------------
// ErrorBanner
// -----------------------------------------------------------
//
// Inline server-error box pinned above the form — announced
// as an alert to assistive tech. Renders nothing without a
// message so the layout only shifts when there is something
// to say.
//
// Used by:
//   - LoginStep (below)
// -----------------------------------------------------------

function ErrorBanner({ message }: { message: string | null }) {

  const { colors } = useTheme();


  if (!message) return null;


  return (
    <View
      className="mb-md flex-row items-center gap-sm rounded-md bg-danger-soft px-md py-sm"
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text className="flex-1 font-raleway text-sm text-danger">{message}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// LoginStep
// -----------------------------------------------------------
//
// The credential form. Validation only checks that both
// fields are non-empty — minimum password length is a
// REGISTRATION rule; enforcing it here would lock out any
// account whose password predates the rule. The username
// field's Next key focuses the password via the Input's
// forwarded ref, Done submits.
//
// On success the 'onboarded' flag lands before navigation and
// the redirect honors ?returnTo (cast for typed routes — the
// overlay passes an arbitrary pathname).
//
// Used by:
//   - LoginScreen (below)
// -----------------------------------------------------------

function LoginStep({ returnTo, onBack, onGuest }: LoginStepProps) {

  const { t } = useTranslation();
  const router = useRouter();
  const { login, loading } = useAuth();


  const [form, setForm] = useState<LoginForm>({ username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<LoginForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);


  const updateField = (field: keyof LoginForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };


  // Non-empty only — see the component banner
  const validateForm = (): boolean => {
    const next: Partial<LoginForm> = {};
    if (!form.username.trim()) next.username = t('login.errors.usernameRequired');
    if (!form.password.trim()) next.password = t('login.errors.passwordRequired');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };


  const handleLogin = async () => {
    if (loading || !validateForm()) return;
    Keyboard.dismiss();
    setServerError(null);

    try {
      await login(form.username.trim(), form.password);

      // Cold-start contract: index.tsx reads this flag, so it
      // must land before we leave the screen
      try {
        await AsyncStorage.setItem('onboarded', '1');
      } catch {
        // Worst case one extra trip through this screen
      }

      router.replace((returnTo || '/(main)/tabs/news') as Href);
    } catch (err) {
      setServerError(errorText(err, t));
    }
  };


  return (
    <View className="flex-1 bg-canvas">

      <FormTopBar title={t('login.title')} onBack={onBack} />

      <SafeAreaView edges={['bottom']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-lg py-xl"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >

          <ErrorBanner message={serverError} />

          <Input
            label={t('login.usernameLabel')}
            placeholder={t('login.usernamePlaceholder')}
            value={form.username}
            onChangeText={(value) => updateField('username', value)}
            error={fieldErrors.username}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Input
            ref={passwordRef}
            label={t('login.passwordLabel')}
            placeholder={t('login.passwordPlaceholder')}
            value={form.password}
            onChangeText={(value) => updateField('password', value)}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <View className="mt-sm">
            <Button title={t('login.signIn')} onPress={handleLogin} loading={loading} size="lg" />
          </View>

          {/* Secondary exits — register and the guest skip */}
          <Pressable
            onPress={() => router.push('/register')}
            className="mt-lg items-center py-sm"
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('login.register')}
          >
            <Text className="text-center font-raleway text-base text-ink-soft">
              {t('login.noAccount')}{' '}
              <Text className="font-raleway-bold text-brand underline">{t('login.register')}</Text>
            </Text>
          </Pressable>

          <Pressable
            onPress={onGuest}
            className="mt-xs items-center py-sm"
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('login.continueAsGuest')}
          >
            <Text className="text-center font-raleway text-base text-ink-faint underline">
              {t('login.continueAsGuest')}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}







// -----------------------------------------------------------
// LoginScreen (default export)
// -----------------------------------------------------------
//
// Owns the step state and the storage gate: first runs start
// on the welcome pitch, returning users ('onboarded' already
// stored) and overlay arrivals (?returnTo=) start on the
// form. The guest skip lives here because both steps offer
// it — it marks 'onboarded' and replaces into the tabs.
//
// Used by:
//   - expo-router — route /login (app/_layout.tsx stack)
//   - app/index.tsx — the cold-start redirect target
//   - components/LoginRequiredOverlay.tsx — pushes /login
//     with ?returnTo= for the post-login return trip
// -----------------------------------------------------------

export default function LoginScreen() {

  const router = useRouter();
  const { colors } = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();


  // null while the stored flag is read — the gate below shows
  // the brand splash instead of flashing the wrong step
  const [step, setStep] = useState<'welcome' | 'login' | null>(null);


  // Overlay arrivals already saw the app — never pitch them
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem('onboarded')
      .then((value) => {
        if (!cancelled) setStep(value !== null || returnTo ? 'login' : 'welcome');
      })
      .catch(() => {
        if (!cancelled) setStep('welcome');
      });

    return () => {
      cancelled = true;
    };
  }, [returnTo]);


  // Guest skip: mark onboarded so index.tsx routes straight
  // to the tabs on the next cold start
  const continueAsGuest = async () => {
    try {
      await AsyncStorage.setItem('onboarded', '1');
    } catch {
      // index.tsx falls back to this screen — harmless
    }
    router.replace('/(main)/tabs/news');
  };


  if (step === null) {
    return (
      <View className="flex-1 items-center justify-center bg-brand">
        <ActivityIndicator size="large" color={colors.onBrand} />
      </View>
    );
  }


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {step === 'welcome' ? (
        <WelcomeStep onContinue={() => setStep('login')} onGuest={continueAsGuest} />
      ) : (
        <LoginStep returnTo={returnTo} onBack={() => setStep('welcome')} onGuest={continueAsGuest} />
      )}
    </KeyboardAvoidingView>
  );
}
