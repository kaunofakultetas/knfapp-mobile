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
//  ?returnTo so overlay users land back where they were —
//  but only after resolveReturnTo proves the value is an
//  in-app pathname (the param also arrives via deep links).
//
//  Server failures surface INLINE above the form, not only as
//  a toast: every failure resolves through apiErrorKey to a
//  TRANSLATED sentence (backend machine code first, then the
//  HTTP status, then the network/timeout sentinels) — raw
//  backend prose never reaches the screen.
//
//  Split into (root component last):
//
//    errorText      — failure → translated display text
//    resolveReturnTo — ?returnTo= validation → safe Href
//    FormTopBar     — brand top bar with the back affordance
//    WelcomeStep    — the burgundy brand pitch
//    ErrorBanner    — inline server-error box above the form
//    LoginStep      — the credential form
//    LoginScreen    — step state + onboarded gate (default export)
// -----------------------------------------------------------

// UI kit and theming
import { Button, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Auth action and the normalized API error shape
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/api';
import { apiErrorKey } from '@/services/api/errors';

// Navigation and the persisted onboarded flag
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
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

// returnTo is the raw (normalized) overlay param — kept so the
// register link can forward it; returnTarget is the already
// VALIDATED redirect target every success path replaces to
interface LoginStepProps {
  returnTo?: string;
  returnTarget: Href;
  onBack: () => void;
  onGuest: () => void;
}







// -----------------------------------------------------------
// errorText
// -----------------------------------------------------------
//
// Maps a failed login onto a TRANSLATED sentence. apiErrorKey
// resolves the backend's machine code first (wrong password
// reads differently from a disabled account), then the HTTP
// status through the overrides below, then the network and
// timeout sentinels — the backend's English prose is never
// shown.
//
// Used by:
//   - LoginStep (below)
// -----------------------------------------------------------

function errorText(err: unknown, t: TFunction): string {

  return t(
    apiErrorKey(err, {
      401: 'login.errorMessage',
      403: 'login.accountDisabled',
      429: 'login.tooManyAttempts',
    }),
  );
}







// -----------------------------------------------------------
// resolveReturnTo
// -----------------------------------------------------------
//
// ?returnTo= comes from LoginRequiredOverlay in the happy
// case, but the same param arrives via deep links — it is a
// navigation target an attacker can write. Only in-app
// pathnames pass: the first element when the param repeats,
// starting with '/' but not '//' (protocol-relative URLs);
// anything else falls back to the news tab. The Href cast is
// applied only AFTER the value is proven in-app, and
// ?returnToPostId= is re-attached so query-parameterised
// screens (news post comments) survive the round trip.
//
// Used by:
//   - LoginStep, LoginScreen (below)
// -----------------------------------------------------------

function resolveReturnTo(
  value: string | string[] | undefined,
  postId?: string | string[],
): Href {

  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/(main)/tabs/news';
  }


  const id = Array.isArray(postId) ? postId[0] : postId;
  if (id) {
    return { pathname: raw, params: { postId: id } } as Href;
  }


  return raw as Href;
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
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-brand-header">

      {/* The mark floats in the free upper space */}
      <View className="flex-1 items-center justify-center">
        <LogoKnF width={180} height={260} />
      </View>

      <View className="w-full items-center px-lg pb-xl">

        <Text className="text-center font-raleway-bold text-2xl text-on-brand">
          {t('login.welcomeTitle')}
        </Text>

        {/* Full-opacity on-brand text and a width cap for the
            balanced two-line look — no baked-in line break */}
        <Text
          className="mt-md text-center font-raleway text-base leading-6 text-on-brand"
          style={{ maxWidth: 300 }}
        >
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
          <Text className="font-raleway-bold text-lg text-brand-text">{t('login.continue')}</Text>
        </Pressable>

        <Pressable
          onPress={onGuest}
          className="mt-md py-sm"
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={t('login.continueAsGuest')}
        >
          <Text className="text-center font-raleway text-base text-on-brand underline">
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
// Inline server-error box pinned above the form — a live
// region so screen readers hear the failure the moment it
// lands, with the translated heading above the sentence.
// Renders nothing without a message so the layout only shifts
// when there is something to say.
//
// Used by:
//   - LoginStep (below)
// -----------------------------------------------------------

function ErrorBanner({ message }: { message: string | null }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (!message) return null;


  return (
    <View
      className="mb-md flex-row items-center gap-sm rounded-md bg-danger-soft px-md py-sm"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <View className="flex-1">
        <Text className="font-raleway-bold text-sm text-danger">{t('login.errorTitle')}</Text>
        <Text className="mt-xs font-raleway text-sm text-danger">{message}</Text>
      </View>
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
// forwarded ref, Done submits. A failed validation is spoken
// through AccessibilityInfo and focus lands on the first
// invalid field.
//
// On success the 'onboarded' flag lands before navigation and
// the redirect replaces to returnTarget — the ?returnTo=
// value already validated by resolveReturnTo. A 429 freezes
// the submit for a visible cooldown instead of inviting an
// instant retry.
//
// Used by:
//   - LoginScreen (below)
// -----------------------------------------------------------

function LoginStep({ returnTo, returnTarget, onBack, onGuest }: LoginStepProps) {

  const { t } = useTranslation();
  const router = useRouter();
  const { login, loading } = useAuth();


  const [form, setForm] = useState<LoginForm>({ username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<LoginForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // The cooldown timer must not fire into an unmounted screen
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);


  const updateField = (field: keyof LoginForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };


  // Non-empty only — see the component banner. The first
  // problem is announced and focused so screen-reader users
  // are not left on a silently refused submit button
  const validateForm = (): boolean => {
    const next: Partial<LoginForm> = {};
    if (!form.username.trim()) next.username = t('login.errors.usernameRequired');
    if (!form.password.trim()) next.password = t('login.errors.passwordRequired');
    setFieldErrors(next);

    if (next.username) {
      AccessibilityInfo.announceForAccessibility(next.username);
      usernameRef.current?.focus();
    } else if (next.password) {
      AccessibilityInfo.announceForAccessibility(next.password);
      passwordRef.current?.focus();
    }

    return Object.keys(next).length === 0;
  };


  const handleLogin = async () => {
    if (loading || cooldown || !validateForm()) return;
    Keyboard.dismiss();
    setServerError(null);

    try {
      // Emails are stored lowercased server-side, so an
      // email-shaped identifier is safe to normalize here;
      // usernames pass through untouched (mixed-case ones
      // exist and the backend compares them case-insensitively)
      const identifier = form.username.trim();
      await login(identifier.includes('@') ? identifier.toLowerCase() : identifier, form.password);

      // Cold-start contract: index.tsx reads this flag, so it
      // must land before we leave the screen
      try {
        await AsyncStorage.setItem('onboarded', '1');
      } catch {
        // Worst case one extra trip through this screen
      }

      router.replace(returnTarget);
    } catch (err) {
      const message = errorText(err, t);
      setServerError(message);
      AccessibilityInfo.announceForAccessibility(message);

      // Rate-limited: a live retry button would just feed the
      // limiter — freeze the submit for a visible moment
      if (err instanceof ApiError && err.status === 429) {
        setCooldown(true);
        if (cooldownRef.current) clearTimeout(cooldownRef.current);
        cooldownRef.current = setTimeout(() => setCooldown(false), 15_000);
      }
    }
  };


  return (
    <View className="flex-1 bg-canvas">

      <FormTopBar title={t('login.title')} onBack={onBack} />

      <SafeAreaView edges={['bottom']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-lg pt-2xl pb-xl"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >

          {/* Identity block — top-aligned so the form sits where the
              thumb rests instead of floating mid-screen */}
          <View className="mb-xl">
            <Text className="font-raleway-medium text-xs uppercase tracking-widest text-brand">
              {t('id.university')}
            </Text>
            <Text className="mt-xs font-raleway-bold text-2xl text-ink">{t('id.faculty')}</Text>
            <Text className="mt-sm font-raleway text-base text-ink-soft">{t('login.subtitle')}</Text>
          </View>

          <ErrorBanner message={serverError} />

          <Input
            ref={usernameRef}
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
            <Button
              title={t('login.signIn')}
              onPress={handleLogin}
              loading={loading}
              disabled={cooldown}
              size="lg"
            />
          </View>

          {/* Secondary exits — register and the guest skip.
              returnTo rides along so registering keeps the
              post-auth return trip */}
          <Pressable
            onPress={() =>
              router.push({ pathname: '/register', params: returnTo ? { returnTo } : {} })
            }
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
// it — it marks 'onboarded' and replaces into the validated
// return target (the news tab when none was given).
//
// Used by:
//   - expo-router — route /login (app/_layout.tsx stack)
//   - app/index.tsx — the cold-start redirect target
//   - components/LoginRequiredOverlay.tsx — pushes /login
//     with ?returnTo= for the post-login return trip
// -----------------------------------------------------------

export default function LoginScreen() {

  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    returnToPostId?: string | string[];
  }>();


  // A repeated deep-link param arrives as string[] — the first
  // element is the one every read site uses
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTarget = resolveReturnTo(params.returnTo, params.returnToPostId);


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


  // Android hardware back from the form returns to the pitch
  // instead of quitting the app. Overlay arrivals skip this —
  // for them the form is the first step and back should pop
  useEffect(() => {
    if (step !== 'login' || returnTo) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('welcome');
      return true;
    });
    return () => subscription.remove();
  }, [step, returnTo]);


  // Overlay arrivals never saw the pitch — their back arrow
  // pops to where they came from instead of dropping them
  // into the first-run welcome step
  const handleFormBack = () => {
    if (returnTo) {
      if (router.canGoBack()) router.back();
      else router.replace(returnTarget);
      return;
    }
    setStep('welcome');
  };


  // Guest skip: mark onboarded so index.tsx routes straight to
  // the tabs on the next cold start; overlay arrivals go back
  // to the (validated) screen they came from
  const continueAsGuest = async () => {
    try {
      await AsyncStorage.setItem('onboarded', '1');
    } catch {
      // index.tsx falls back to this screen — harmless
    }
    router.replace(returnTarget);
  };


  if (step === null) {
    return (
      <View
        className="flex-1 items-center justify-center bg-brand-header"
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator
          size="large"
          color={colors.onBrand}
          accessibilityLabel={t('common.loading')}
        />
      </View>
    );
  }


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {step === 'welcome' ? (
        <WelcomeStep onContinue={() => setStep('login')} onGuest={continueAsGuest} />
      ) : (
        <LoginStep
          returnTo={returnTo}
          returnTarget={returnTarget}
          onBack={handleFormBack}
          onGuest={continueAsGuest}
        />
      )}
    </KeyboardAvoidingView>
  );
}
