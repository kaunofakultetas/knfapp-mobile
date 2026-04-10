import QrScanner from '@/components/QrScanner';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { validateInvitationCode } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface FormData {
  invitationCode: string;
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

/** Map backend role to i18n key */
function roleDisplayKey(role: string): string {
  const map: Record<string, string> = {
    student: 'admin.roleStudent',
    teacher: 'admin.roleTeacher',
    curator: 'admin.roleCurator',
    admin: 'admin.roleAdmin',
  };
  return map[role] || 'admin.roleStudent';
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register, loading } = useAuth();
  const { t } = useTranslation();

  const [form, setForm] = useState<FormData>({
    invitationCode: '',
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [scannerVisible, setScannerVisible] = useState(false);
  const [codeValidation, setCodeValidation] = useState<{
    valid?: boolean;
    role?: string;
    remainingUses?: number;
    checking?: boolean;
    error?: string;
  }>({});

  // Debounced validation for manual code entry
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) {
      setCodeValidation({});
      return;
    }

    setCodeValidation({ checking: true });

    try {
      const result = await validateInvitationCode(trimmed);
      setCodeValidation({
        valid: result.valid,
        role: result.role,
        remainingUses: result.remainingUses,
        error: result.valid ? undefined : result.error,
      });
      if (!result.valid) {
        setErrors((prev) => ({
          ...prev,
          invitationCode: result.error || t('register.invalidCode'),
        }));
      } else {
        // Clear any prior error on the invitation code field
        setErrors((prev) => ({ ...prev, invitationCode: undefined }));
      }
    } catch {
      setCodeValidation({});
    }
  }, [t]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const validate = (): boolean => {
    const e: FormErrors = {};

    // Invitation code is optional -- if blank, user registers as guest
    if (!form.username.trim()) {
      e.username = t('register.errors.usernameRequired');
    } else if (form.username.length < 3) {
      e.username = t('register.errors.usernameMin');
    }
    if (!form.displayName.trim()) {
      e.displayName = t('register.errors.displayNameRequired');
    }
    if (!form.email.trim()) {
      e.email = t('register.errors.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = t('register.errors.emailInvalid');
    }
    if (!form.password) {
      e.password = t('register.errors.passwordRequired');
    } else if (form.password.length < 6) {
      e.password = t('register.errors.passwordMin');
    }
    if (form.password !== form.confirmPassword) {
      e.confirmPassword = t('register.errors.passwordMismatch');
    }
    // If user typed a code but it was validated as invalid, block submit
    if (form.invitationCode.trim() && codeValidation.valid === false) {
      e.invitationCode = codeValidation.error || t('register.invalidCode');
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    try {
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
      // Only include invitation_code if user provided one
      const code = form.invitationCode.trim();
      if (code) {
        params.invitation_code = code;
      }

      await register(params);
      router.replace('/(main)/tabs/news');
    } catch (error: any) {
      const message = error?.message || t('register.errorMessage');
      showToast('error', t('register.errorTitle'), message);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCodeChange = (value: string) => {
    updateField('invitationCode', value);
    setCodeValidation({});

    // Debounce validation -- wait 600ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      validateCode(value);
    }, 600);
  };

  const handleCodeScanned = async (code: string) => {
    updateField('invitationCode', code);
    setCodeValidation({ checking: true });

    try {
      const result = await validateInvitationCode(code);
      setCodeValidation({
        valid: result.valid,
        role: result.role,
        remainingUses: result.remainingUses,
        error: result.valid ? undefined : result.error,
      });
      if (!result.valid) {
        setErrors((prev) => ({
          ...prev,
          invitationCode: result.error || t('register.invalidQr'),
        }));
      } else {
        setErrors((prev) => ({ ...prev, invitationCode: undefined }));
      }
    } catch {
      setCodeValidation({});
    }
  };

  // Whether user will register as guest (no valid code)
  const isGuestMode = !form.invitationCode.trim() || codeValidation.valid !== true;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-primary"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView className="flex-1">
          <ScrollView
            contentContainerClassName="flex-grow justify-center px-lg py-xl"
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-3xl mb-sm text-white font-raleway-bold text-center">
              {t('register.title')}
            </Text>
            <Text className="text-white/70 text-center mb-md font-raleway text-base leading-6">
              {t('register.subtitle')}
            </Text>
            <Text className="text-white/50 text-center mb-xl font-raleway text-xs leading-4">
              {t('register.guestHint')}
            </Text>

            {/* QR Scanner Button */}
            <Pressable
              onPress={() => setScannerVisible(true)}
              className="bg-white/15 border border-white/30 rounded-xl py-4 px-5 mb-lg flex-row items-center justify-center"
              style={({ pressed }) => [pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="qr-code" size={22} color="white" />
              <Text className="text-white font-raleway-bold text-base ml-3">
                {t('register.scanQr')}
              </Text>
            </Pressable>

            <Text className="text-white/40 text-center mb-lg font-raleway text-sm">
              {t('register.orEnterManually')}
            </Text>

            {/* Invitation code field with real-time validation */}
            <View className="mb-md">
              <Input
                label={t('register.invitationLabel')}
                placeholder={t('register.invitationPlaceholder')}
                value={form.invitationCode}
                onChangeText={handleCodeChange}
                error={errors.invitationCode}
                autoCapitalize="characters"
                autoCorrect={false}
                containerClassName="w-full"
                labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
              />
              {codeValidation.checking && (
                <View className="flex-row items-center mt-1.5 ml-1">
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <Text className="text-white/70 text-xs ml-2 font-raleway">{t('register.checkingCode')}</Text>
                </View>
              )}
              {codeValidation.valid === true && codeValidation.role && (
                <View className="bg-white/10 rounded-lg p-3 mt-2">
                  <View className="flex-row items-center">
                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                    <Text className="text-green-400 text-sm ml-2 font-raleway-bold">
                      {t('register.codeValid')}
                    </Text>
                  </View>
                  <View className="flex-row items-center mt-1.5 ml-6">
                    <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.7)" />
                    <Text className="text-white/70 text-xs ml-1.5 font-raleway">
                      {t('register.codeRole', { role: t(roleDisplayKey(codeValidation.role)) })}
                    </Text>
                  </View>
                  {codeValidation.remainingUses !== undefined && (
                    <View className="flex-row items-center mt-1 ml-6">
                      <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.7)" />
                      <Text className="text-white/70 text-xs ml-1.5 font-raleway">
                        {t('register.codeRemaining', { count: codeValidation.remainingUses })}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              {codeValidation.valid === false && codeValidation.error && !errors.invitationCode && (
                <View className="flex-row items-center mt-1.5 ml-1">
                  <Ionicons name="close-circle" size={16} color="#EF5350" />
                  <Text className="text-red-400 text-xs ml-1 font-raleway">
                    {codeValidation.error}
                  </Text>
                </View>
              )}
            </View>

            {/* Guest/Invited mode indicator */}
            <View className="flex-row items-center mb-md px-1">
              <Ionicons
                name={isGuestMode ? 'person-outline' : 'ribbon-outline'}
                size={14}
                color={isGuestMode ? 'rgba(255,255,255,0.5)' : '#4CAF50'}
              />
              <Text className={`text-xs ml-1.5 font-raleway ${isGuestMode ? 'text-white/50' : 'text-green-400'}`}>
                {isGuestMode ? t('register.registeringAsGuest') : t('register.registeringAsInvited')}
              </Text>
            </View>

            <Input
              label={t('register.usernameLabel')}
              placeholder={t('register.usernamePlaceholder')}
              value={form.username}
              onChangeText={(v) => updateField('username', v)}
              error={errors.username}
              autoCapitalize="none"
              autoCorrect={false}
              containerClassName="w-full mb-md"
              labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
            />

            <Input
              label={t('register.displayNameLabel')}
              placeholder={t('register.displayNamePlaceholder')}
              value={form.displayName}
              onChangeText={(v) => updateField('displayName', v)}
              error={errors.displayName}
              containerClassName="w-full mb-md"
              labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
            />

            <Input
              label={t('register.emailLabel')}
              placeholder={t('register.emailPlaceholder')}
              value={form.email}
              onChangeText={(v) => updateField('email', v)}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              containerClassName="w-full mb-md"
              labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
            />

            <Input
              label={t('register.passwordLabel')}
              placeholder={t('register.passwordPlaceholder')}
              value={form.password}
              onChangeText={(v) => updateField('password', v)}
              error={errors.password}
              secureTextEntry
              containerClassName="w-full mb-md"
              labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
            />

            <Input
              label={t('register.confirmPasswordLabel')}
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={form.confirmPassword}
              onChangeText={(v) => updateField('confirmPassword', v)}
              error={errors.confirmPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              containerClassName="w-full mb-lg"
              labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
            />

            <Button
              title={t('register.submit')}
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              fullWidth
              className="bg-white mt-md rounded-full"
              textClassName="text-primary font-raleway-bold"
            />

            <Pressable onPress={() => router.back()} className="mt-lg self-center">
              <Text className="text-white font-raleway">
                {t('register.alreadyHaveAccount')}{' '}
                <Text className="font-raleway-bold underline">{t('register.signIn')}</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </TouchableWithoutFeedback>

      <QrScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onCodeScanned={handleCodeScanned}
      />
    </KeyboardAvoidingView>
  );
}
