// -----------------------------------------------------------
//  [*] Auth — Register
//
//  Invitation-code-OPTIONAL registration: without a code the
//  account is created as a guest with reduced trust, with a
//  valid one the backend grants the code's role. The code
//  arrives three ways — typed (debounced live validation),
//  scanned in-app (the QrScanner modal), or via the admin QR
//  deep link knfapp://register?code=X (the ?code= route
//  param, applied once per value).
//
//  All three paths funnel into ONE validation routine with a
//  sequence guard: every run bumps a counter and a stale
//  response (an older code resolving after a newer one) is
//  dropped instead of clobbering the current verdict. A scan
//  or deep link also clears any pending typing debounce, so
//  the stale timer cannot overwrite the scanned code's
//  result. Submit is disabled while a check is in flight, and
//  a failed check toasts instead of vanishing silently.
//
//  Successful registration writes 'onboarded' before
//  navigating — the same cold-start contract as login.tsx:
//  index.tsx reads that flag and would otherwise bounce the
//  fresh account back to onboarding on the next launch.
//
//  Split into (root component last):
//
//    ROLE_KEYS      — backend role → translation key
//    errorText      — failure → display text mapping
//    FormTopBar     — brand top bar, back to login
//    CodeStatus     — live code-check feedback
//    ModeIndicator  — guest vs invited registration row
//    RegisterScreen — the form (default export)
// -----------------------------------------------------------

// UI kit, scanner modal and theming
import QrScanner from '@/components/QrScanner';
import { Button, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Auth action, live code validation and the error shape
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { ApiError, validateInvitationCode } from '@/services/api';

// Navigation and the persisted onboarded flag
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
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


// Roles the backend can grant via invitation codes; an
// unknown role renders raw instead of being mislabeled
const ROLE_KEYS: Record<string, string> = {
  student: 'admin.roleStudent',
  teacher: 'admin.roleTeacher',
  curator: 'admin.roleCurator',
  admin: 'admin.roleAdmin',
};

// Field values; keys double as the error-map keys
interface RegisterFields {
  invitationCode: string;
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<keyof RegisterFields, string>>;

// Live verdict for the invitation-code field; {} means
// nothing to show (blank/short code or a failed check)
interface CodeValidation {
  checking?: boolean;
  valid?: boolean;
  role?: string;
  remainingUses?: number;
  error?: string;
}







// -----------------------------------------------------------
// errorText
// -----------------------------------------------------------
//
// Maps an ApiError onto display text: 'http' keeps the
// backend's own message (already entity-decoded), 'timeout'
// and 'network' are sentinel codes the api layer leaves for
// the UI to translate. fallbackKey covers an http failure
// that carries no message text.
//
// Used by:
//   - RegisterScreen (below) — submit failures and
//     code-validation errors
// -----------------------------------------------------------

function errorText(err: unknown, t: TFunction, fallbackKey: string): string {

  if (err instanceof ApiError && err.code === 'http') {
    return err.message || t(fallbackKey);
  }


  return err instanceof ApiError && err.code === 'timeout'
    ? t('toast.timeout')
    : t('toast.networkError');
}







// -----------------------------------------------------------
// FormTopBar
// -----------------------------------------------------------
//
// The burgundy band above the form — keeps the app-wide
// "brand top on every screen" invariant behind the root
// layout's light StatusBar, and carries the back-to-login
// affordance.
//
// Used by:
//   - RegisterScreen (below)
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
// CodeStatus
// -----------------------------------------------------------
//
// Feedback under the invitation-code field: a spinner while
// the check runs, a success wash with the granted role and
// remaining uses when the code is valid. The INVALID case is
// not rendered here — it lands on the Input's own error line.
//
// Used by:
//   - RegisterScreen (below)
// -----------------------------------------------------------

function CodeStatus({ validation }: { validation: CodeValidation }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (validation.checking) {
    return (
      <View className="mb-md flex-row items-center gap-sm px-xs">
        <ActivityIndicator size="small" color={colors.brand} />
        <Text className="font-raleway text-xs text-ink-soft">{t('register.checkingCode')}</Text>
      </View>
    );
  }


  if (!validation.valid || !validation.role) return null;


  return (
    <View className="mb-md rounded-md bg-success-soft p-md">

      <View className="flex-row items-center gap-sm">
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text className="font-raleway-bold text-sm text-success">{t('register.codeValid')}</Text>
      </View>

      <View className="mt-xs flex-row items-center gap-sm pl-lg">
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.inkSoft} />
        <Text className="font-raleway text-xs text-ink-soft">
          {t('register.codeRole', {
            role: ROLE_KEYS[validation.role] ? t(ROLE_KEYS[validation.role]) : validation.role,
          })}
        </Text>
      </View>

      {validation.remainingUses !== undefined && (
        <View className="mt-xs flex-row items-center gap-sm pl-lg">
          <Ionicons name="people-outline" size={14} color={colors.inkSoft} />
          <Text className="font-raleway text-xs text-ink-soft">
            {t('register.codeRemaining', { count: validation.remainingUses })}
          </Text>
        </View>
      )}
    </View>
  );
}







// -----------------------------------------------------------
// ModeIndicator
// -----------------------------------------------------------
//
// One quiet row stating what kind of account the submit will
// create — guest (no valid code) or invited — so the
// optional-code contract stays visible, not implied.
//
// Used by:
//   - RegisterScreen (below)
// -----------------------------------------------------------

function ModeIndicator({ invited }: { invited: boolean }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="mb-lg flex-row items-center gap-sm px-xs">
      <Ionicons
        name={invited ? 'ribbon-outline' : 'person-outline'}
        size={14}
        color={invited ? colors.success : colors.inkFaint}
      />
      <Text
        className={
          invited ? 'font-raleway text-xs text-success' : 'font-raleway text-xs text-ink-faint'
        }
      >
        {t(invited ? 'register.registeringAsInvited' : 'register.registeringAsGuest')}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// RegisterScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — route /register (app/_layout.tsx stack)
//   - app/login.tsx — the "no account yet" link
//   - the admin QR deep link knfapp://register?code=X
// -----------------------------------------------------------

export default function RegisterScreen() {

  const { t } = useTranslation();
  const router = useRouter();
  const { register, loading } = useAuth();
  const { code: codeParam } = useLocalSearchParams<{ code?: string }>();


  const [form, setForm] = useState<RegisterFields>({
    invitationCode: '',
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [codeValidation, setCodeValidation] = useState<CodeValidation>({});
  const [scannerVisible, setScannerVisible] = useState(false);


  // Focus chain — each field's Next key lands on the one below
  const usernameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);


  // Typing debounce + the sequence guard (every validation run
  // bumps the counter; stale responses compare and drop) + the
  // once-per-value latch for the deep-link param
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const appliedParamRef = useRef<string | null>(null);


  // The one validation routine behind typing, scans and the
  // deep link; invalidKey names which entry path failed
  const runValidation = useCallback(
    async (raw: string, invalidKey: string) => {
      const seq = ++seqRef.current;
      const trimmed = raw.trim();

      if (!trimmed || trimmed.length < 4) {
        setCodeValidation({});
        return;
      }

      setCodeValidation({ checking: true });

      try {
        const result = await validateInvitationCode(trimmed);
        if (seq !== seqRef.current) return; // superseded by a newer run

        const message = result.valid ? undefined : result.error || t(invalidKey);
        setCodeValidation({
          valid: result.valid,
          role: result.role,
          remainingUses: result.remainingUses,
          error: message,
        });
        setErrors((prev) => ({ ...prev, invitationCode: message }));
      } catch (err) {
        if (seq !== seqRef.current) return;

        // The check failed, not the code — clear the verdict
        // and say so instead of a silently vanishing spinner
        setCodeValidation({});
        showToast('error', errorText(err, t, 'toast.genericError'));
      }
    },
    [t],
  );


  const updateField = (field: keyof RegisterFields, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };


  // Manual typing: reset the verdict, bump the sequence so any
  // in-flight response is orphaned, re-validate after a pause
  const handleCodeChange = (value: string) => {
    updateField('invitationCode', value);
    seqRef.current += 1;
    setCodeValidation({});

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runValidation(value, 'register.invalidCode');
    }, 600);
  };


  // Scans and the deep link share this path. The typing
  // debounce dies FIRST — a stale timer firing after the scan
  // would overwrite the scanned code's verdict with the
  // half-typed one.
  const applyScannedCode = useCallback(
    (scanned: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      setForm((prev) => ({ ...prev, invitationCode: scanned }));
      setErrors((prev) => ({ ...prev, invitationCode: undefined }));
      showToast('success', t('register.codeScanned', { code: scanned }));
      runValidation(scanned, 'register.invalidQr');
    },
    [runValidation, t],
  );


  // The admin QR encodes knfapp://register?code=X — apply the
  // route param once per value so re-renders cannot re-run it
  useEffect(() => {
    if (!codeParam || appliedParamRef.current === codeParam) return;
    appliedParamRef.current = codeParam;
    applyScannedCode(codeParam);
  }, [codeParam, applyScannedCode]);


  // The pending debounce must not fire into an unmounted screen
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);


  // The code is optional — its only blocking state is an
  // explicit invalid verdict; everything else is guest mode
  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!form.username.trim()) next.username = t('register.errors.usernameRequired');
    else if (form.username.trim().length < 3) next.username = t('register.errors.usernameMin');
    if (!form.displayName.trim()) next.displayName = t('register.errors.displayNameRequired');
    if (!form.email.trim()) next.email = t('register.errors.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = t('register.errors.emailInvalid');
    }
    if (!form.password) next.password = t('register.errors.passwordRequired');
    else if (form.password.length < 6) next.password = t('register.errors.passwordMin');
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = t('register.errors.passwordMismatch');
    }
    if (form.invitationCode.trim() && codeValidation.valid === false) {
      next.invitationCode = codeValidation.error || t('register.invalidCode');
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };


  const handleRegister = async () => {
    // The button is disabled while a code check is in flight —
    // this guards the keyboard's Done key taking the same path
    if (loading || codeValidation.checking) return;
    if (!validate()) return;
    Keyboard.dismiss();

    const params: {
      invitation_code?: string;
      username: string;
      password: string;
      display_name: string;
      email: string;
    } = {
      username: form.username.trim(),
      password: form.password,
      display_name: form.displayName.trim(),
      email: form.email.trim().toLowerCase(),
    };
    const code = form.invitationCode.trim();
    if (code) params.invitation_code = code;

    try {
      await register(params);

      // Cold-start contract: index.tsx reads this flag, so it
      // must land before we leave the screen
      try {
        await AsyncStorage.setItem('onboarded', '1');
      } catch {
        // Worst case one extra trip through onboarding
      }

      router.replace('/(main)/tabs/news');
    } catch (err) {
      showToast('error', t('register.errorTitle'), errorText(err, t, 'register.errorMessage'));
    }
  };


  // A push from /login is the normal arrival, so back() lands
  // there; a deep link has no history and replaces instead —
  // plain router.back() used to be a silent no-op then
  const goToLogin = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };


  const invited = codeValidation.valid === true;


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

      <FormTopBar title={t('register.title')} onBack={goToLogin} />

      <SafeAreaView edges={['bottom']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-lg py-xl"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >

          <Text className="text-center font-raleway text-base leading-6 text-ink-soft">
            {t('register.subtitle')}
          </Text>
          <Text className="mt-xs mb-lg text-center font-raleway text-xs leading-4 text-ink-faint">
            {t('register.guestHint')}
          </Text>

          {/* Invitation code — QR scan first, manual entry below */}
          <Button
            title={t('register.scanQr')}
            variant="outline"
            leftIcon="qr-code-outline"
            onPress={() => setScannerVisible(true)}
          />

          <Text className="my-md text-center font-raleway text-sm text-ink-faint">
            {t('register.orEnterManually')}
          </Text>

          <Input
            label={t('register.invitationLabel')}
            placeholder={t('register.invitationPlaceholder')}
            value={form.invitationCode}
            onChangeText={handleCodeChange}
            error={errors.invitationCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="next"
            onSubmitEditing={() => usernameRef.current?.focus()}
          />

          <CodeStatus validation={codeValidation} />
          <ModeIndicator invited={invited} />

          {/* The account fields — Next chains to the field below */}
          <Input
            ref={usernameRef}
            label={t('register.usernameLabel')}
            placeholder={t('register.usernamePlaceholder')}
            value={form.username}
            onChangeText={(value) => updateField('username', value)}
            error={errors.username}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => displayNameRef.current?.focus()}
          />

          <Input
            ref={displayNameRef}
            label={t('register.displayNameLabel')}
            placeholder={t('register.displayNamePlaceholder')}
            value={form.displayName}
            onChangeText={(value) => updateField('displayName', value)}
            error={errors.displayName}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <Input
            ref={emailRef}
            label={t('register.emailLabel')}
            placeholder={t('register.emailPlaceholder')}
            value={form.email}
            onChangeText={(value) => updateField('email', value)}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Input
            ref={passwordRef}
            label={t('register.passwordLabel')}
            placeholder={t('register.passwordPlaceholder')}
            value={form.password}
            onChangeText={(value) => updateField('password', value)}
            error={errors.password}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />

          <Input
            ref={confirmRef}
            label={t('register.confirmPasswordLabel')}
            placeholder={t('register.confirmPasswordPlaceholder')}
            value={form.confirmPassword}
            onChangeText={(value) => updateField('confirmPassword', value)}
            error={errors.confirmPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <View className="mt-sm">
            <Button
              title={t('register.submit')}
              onPress={handleRegister}
              loading={loading}
              disabled={codeValidation.checking}
              size="lg"
            />
          </View>

          <Pressable
            onPress={goToLogin}
            className="mt-lg items-center py-sm"
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('register.signIn')}
          >
            <Text className="text-center font-raleway text-base text-ink-soft">
              {t('register.alreadyHaveAccount')}{' '}
              <Text className="font-raleway-bold text-brand underline">{t('register.signIn')}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <QrScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onCodeScanned={applyScannedCode}
      />
    </KeyboardAvoidingView>
  );
}
