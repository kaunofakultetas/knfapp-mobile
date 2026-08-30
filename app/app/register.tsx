// -----------------------------------------------------------
//  [*] Auth — Register
//
//  Invitation-code-OPTIONAL registration: without a code the
//  account is created as a guest with reduced trust, with a
//  valid one the backend grants the code's role. The code
//  arrives three ways — typed (debounced live validation,
//  uppercased to match the code alphabet), scanned in-app
//  (the QrScanner modal), or via the admin QR deep link
//  knfapp://register?code=X (the ?code= route param, applied
//  once per value and run through the scanner's extractCode
//  check so attacker text never reaches the field or toast).
//
//  All three paths funnel into ONE validation routine with a
//  sequence guard: every run bumps a counter and a stale
//  response (an older code resolving after a newer one) is
//  dropped instead of clobbering the current verdict. A scan
//  or deep link also clears any pending typing debounce, so
//  the stale timer cannot overwrite the scanned code's
//  result. Submit is disabled while a check is in flight,
//  flushes any pending typing debounce and branches on the
//  returned verdict, and a failed check toasts instead of
//  vanishing silently.
//
//  Successful registration writes 'onboarded' before
//  navigating — the same cold-start contract as login.tsx:
//  index.tsx reads that flag and would otherwise bounce the
//  fresh account back to onboarding on the next launch.
//
//  Split into (root component last):
//
//    REASON_KEYS     — validate-code reason → i18n key
//    errorText       — failure → translated display text
//    errorHint       — hint line for connectivity toasts
//    inviteErrorKey  — submit failure → code-field routing
//    resolveReturnTo — ?returnTo= validation → safe Href
//    FormTopBar      — brand top bar, back to login
//    CodeStatus      — live code-check feedback
//    ModeIndicator   — guest vs invited registration row
//    RegisterScreen  — the form (default export)
// -----------------------------------------------------------

// UI kit, scanner modal and theming
import QrScanner, { extractCode } from '@/components/QrScanner';
import { Button, Input } from '@/components/ui';
import { roleLabel } from '@/constants/roles';
import { useTheme } from '@/hooks/useTheme';

// Auth action, live code validation and the error shape
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { ApiError, validateInvitationCode } from '@/services/api';
import { apiErrorKey } from '@/services/api/errors';

// Navigation and the persisted onboarded flag
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
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


// validate-code failure reasons → precise i18n sentences; an
// unrecognized reason falls back to the entry path's own key
const REASON_KEYS: Record<string, string> = {
  unknown: 'register.codeUnknown',
  exhausted: 'register.codeExhausted',
  expired: 'register.codeExpired',
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
// Maps a failure onto a TRANSLATED sentence. apiErrorKey
// resolves the backend's machine code first, then the HTTP
// status through the overrides below, then the network and
// timeout sentinels — the backend's English prose is never
// shown.
//
// Used by:
//   - RegisterScreen (below) — submit failures and
//     code-validation errors
// -----------------------------------------------------------

function errorText(err: unknown, t: TFunction): string {

  return t(
    apiErrorKey(err, {
      400: 'register.invalidCode',
      409: 'register.usernameTaken',
      429: 'login.tooManyAttempts',
    }),
  );
}







// -----------------------------------------------------------
// errorHint
// -----------------------------------------------------------
//
// The second toast line for connectivity failures — the hint
// tells the user what to DO (check the connection, wait for
// the server) while errorText says what happened. Everything
// else gets no hint.
//
// Used by:
//   - RegisterScreen (below)
// -----------------------------------------------------------

function errorHint(err: unknown, t: TFunction): string | undefined {

  if (!(err instanceof ApiError)) return undefined;


  if (err.code === 'network') return t('toast.networkErrorHint');
  if (err.code === 'timeout') return t('toast.timeoutHint');
  return undefined;
}







// -----------------------------------------------------------
// inviteErrorKey
// -----------------------------------------------------------
//
// Decides whether a submit failure belongs on the invitation-
// code FIELD instead of a toast: the backend's invite_* codes
// map to their precise sentences, and a code-carrying 400
// without any machine code still reads as an invite problem.
// Returns null for everything that is not about the code.
//
// The code-less-400 guess is safe only while validate()
// pre-empts every OTHER register 400 the backend can send
// without a machine code (required fields, string shape,
// password length, the 100-char display-name cap) — keep
// them in lockstep.
//
// Used by:
//   - RegisterScreen (below) — handleRegister's catch
// -----------------------------------------------------------

function inviteErrorKey(err: unknown, codeSent: boolean): string | null {

  if (!(err instanceof ApiError)) return null;


  if (err.serverCode === 'invite_invalid') return 'register.invalidCode';
  if (err.serverCode === 'invite_expired') return 'register.codeExpired';
  if (err.serverCode === 'invite_exhausted') return 'register.codeExhausted';


  return codeSent && err.status === 400 && !err.serverCode ? 'register.invalidCode' : null;
}







// -----------------------------------------------------------
// resolveReturnTo
// -----------------------------------------------------------
//
// The same guard as login.tsx's: ?returnTo= rides along from
// the login screen's register link, but the param also
// arrives via deep links — only an in-app pathname (first
// element when repeated, '/' but not '//') may steer the
// post-registration redirect; anything else falls back to the
// news tab.
//
// Used by:
//   - RegisterScreen (below)
// -----------------------------------------------------------

function resolveReturnTo(value: string | string[] | undefined): Href {

  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/(main)/tabs/news';
  }


  return raw as Href;
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
      <View
        className="mb-md flex-row items-center gap-sm px-xs"
        accessible
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="small" color={colors.brand} />
        <Text className="font-raleway text-xs text-ink-soft">{t('register.checkingCode')}</Text>
      </View>
    );
  }


  if (!validation.valid || !validation.role) return null;


  return (
    <View className="mb-md rounded-md bg-success-soft p-md" accessible accessibilityLiveRegion="polite">

      <View className="flex-row items-center gap-sm">
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text className="font-raleway-bold text-sm text-success">{t('register.codeValid')}</Text>
      </View>

      <View className="mt-xs flex-row items-center gap-sm pl-lg">
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.inkSoft} />
        <Text className="font-raleway text-xs text-ink-soft">
          {t('register.codeRole', { role: roleLabel(t, validation.role) })}
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
  const { code: codeParam, returnTo: returnToParam } = useLocalSearchParams<{
    code?: string | string[];
    returnTo?: string | string[];
  }>();


  // A repeated deep-link param arrives as string[] — only the
  // first element is honored; returnTo is validated before it
  // can steer the post-registration redirect
  const codeValue = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  const returnTarget = resolveReturnTo(returnToParam);


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
  const [cooldown, setCooldown] = useState(false);


  // Focus chain — each field's Next key lands on the one below
  const codeRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);


  // Typing debounce + the sequence guard (every validation run
  // bumps the counter; stale responses compare and drop) + the
  // once-per-value latch for the deep-link param + the 429
  // submit cooldown timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const appliedParamRef = useRef<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // The one validation routine behind typing, scans and the
  // deep link; invalidKey names which entry path failed.
  // RETURNS the verdict (true/false) — or null when nothing
  // was decided (blank code, superseded run, failed check) —
  // because state read after an await is the stale closure
  const runValidation = useCallback(
    async (raw: string, invalidKey: string): Promise<boolean | null> => {
      const seq = ++seqRef.current;
      const trimmed = raw.trim();

      if (!trimmed || trimmed.length < 4) {
        setCodeValidation({});
        return null;
      }

      setCodeValidation({ checking: true });

      try {
        const result = await validateInvitationCode(trimmed);
        if (seq !== seqRef.current) return null; // superseded by a newer run

        // The translated verdict always wins — the backend's
        // English prose never reaches the field; `reason`
        // picks the precise sentence when the backend sends one
        const message = result.valid
          ? undefined
          : t(REASON_KEYS[result.reason ?? ''] || invalidKey);
        setCodeValidation({
          valid: result.valid,
          role: result.role,
          remainingUses: result.remainingUses,
          error: message,
        });
        setErrors((prev) => ({ ...prev, invitationCode: message }));

        // Android hears CodeStatus's live region; iOS needs
        // the explicit announcement
        if (Platform.OS === 'ios') {
          AccessibilityInfo.announceForAccessibility(message ?? t('register.codeValid'));
        }
        return result.valid;
      } catch (err) {
        if (seq !== seqRef.current) return null;

        // The check failed, not the code — clear the verdict
        // and say so instead of a silently vanishing spinner
        setCodeValidation({});
        showToast('error', errorText(err, t), errorHint(err, t));
        return null;
      }
    },
    [t],
  );


  const updateField = (field: keyof RegisterFields, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };


  // Manual typing: uppercase (codes are uppercase — the same
  // normalization the scanner applies), reset the verdict,
  // bump the sequence so any in-flight response is orphaned,
  // re-validate after a pause
  const handleCodeChange = (value: string) => {
    const upper = value.toUpperCase();
    updateField('invitationCode', upper);
    seqRef.current += 1;
    setCodeValidation({});

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runValidation(upper, 'register.invalidCode');
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
  // route param once per value so re-renders cannot re-run it.
  // The param is attacker-writable, so only a value passing
  // the scanner's own extractCode check reaches the field (and
  // the success toast that echoes it)
  useEffect(() => {
    if (!codeValue || appliedParamRef.current === codeValue) return;
    appliedParamRef.current = codeValue;

    const extracted = extractCode(codeValue);
    if (!extracted) return;
    applyScannedCode(extracted);
  }, [codeValue, applyScannedCode]);


  // Pending timers must not fire into an unmounted screen
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);


  // The code is optional — its only blocking state is an
  // explicit invalid verdict; everything else is guest mode.
  // The first problem is announced and focused so screen-
  // reader users are not left on a silently refused submit
  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!form.username.trim()) next.username = t('register.errors.usernameRequired');
    else if (form.username.trim().length < 3) next.username = t('register.errors.usernameMin');
    if (!form.displayName.trim()) next.displayName = t('register.errors.displayNameRequired');
    else if (form.displayName.trim().length > 100) {
      // Mirrors the backend's 100-char cap — its rejection is a
      // code-less 400 inviteErrorKey would misread as an
      // invitation-code failure, so it must never be reachable
      next.displayName = t('register.errors.displayNameMax');
    }
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

    const fieldRefs = {
      invitationCode: codeRef,
      username: usernameRef,
      displayName: displayNameRef,
      email: emailRef,
      password: passwordRef,
      confirmPassword: confirmRef,
    } as const;
    const order: (keyof RegisterFields)[] = [
      'invitationCode',
      'username',
      'displayName',
      'email',
      'password',
      'confirmPassword',
    ];
    const first = order.find((field) => next[field]);
    if (first) {
      AccessibilityInfo.announceForAccessibility(next[first]!);
      fieldRefs[first].current?.focus();
    }

    return Object.keys(next).length === 0;
  };


  const handleRegister = async () => {
    // The button is disabled while a code check is in flight —
    // this guards the keyboard's Done key taking the same path
    if (loading || cooldown || codeValidation.checking) return;

    // A pending typing debounce means the current code was
    // never checked — flush it and branch on the RETURNED
    // verdict (state read after the await is the stale closure)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const verdict = await runValidation(form.invitationCode, 'register.invalidCode');
      if (verdict === false) return; // runValidation set the field error
    }

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

      router.replace(returnTarget);
    } catch (err) {
      // Invite failures land on the field they belong to; the
      // rest toast — connectivity ones with their hint line
      const codeKey = inviteErrorKey(err, Boolean(code));
      if (codeKey) {
        setErrors((prev) => ({ ...prev, invitationCode: t(codeKey) }));
        setCodeValidation({ valid: false, error: t(codeKey) });
        AccessibilityInfo.announceForAccessibility(t(codeKey));
        return;
      }

      if (err instanceof ApiError && (err.code === 'network' || err.code === 'timeout')) {
        showToast('error', errorText(err, t), errorHint(err, t));
      } else {
        showToast('error', t('register.errorTitle'), errorText(err, t));
      }

      // Rate-limited: freeze the submit for a visible moment
      // instead of inviting an instant retry
      if (err instanceof ApiError && err.status === 429) {
        setCooldown(true);
        if (cooldownRef.current) clearTimeout(cooldownRef.current);
        cooldownRef.current = setTimeout(() => setCooldown(false), 15_000);
      }
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            ref={codeRef}
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
            maxLength={100}
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
              disabled={codeValidation.checking || cooldown}
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
