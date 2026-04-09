import QrScanner from '@/components/QrScanner';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { validateInvitationCode } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
    checking?: boolean;
  }>({});

  const validate = (): boolean => {
    const e: FormErrors = {};

    if (!form.invitationCode.trim()) {
      e.invitationCode = t('register.errors.invitationRequired');
    }
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

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    try {
      await register({
        invitation_code: form.invitationCode.trim(),
        username: form.username.trim(),
        password: form.password,
        display_name: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
      });
      router.replace('/(main)/tabs/news');
    } catch (error: any) {
      const message = error?.message || t('register.errorMessage');
      Alert.alert(t('register.errorTitle'), message, [{ text: t('common.ok') }]);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleCodeScanned = async (code: string) => {
    updateField('invitationCode', code);
    setCodeValidation({ checking: true });

    try {
      const result = await validateInvitationCode(code);
      setCodeValidation({ valid: result.valid, role: result.role });
      if (!result.valid) {
        setErrors((prev) => ({
          ...prev,
          invitationCode: result.error || t('register.invalidQr'),
        }));
      }
    } catch {
      setCodeValidation({});
    }
  };

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
            <Text className="text-3xl mb-md text-white font-raleway-bold text-center">
              {t('register.title')}
            </Text>
            <Text className="text-gray-300 text-center mb-xl font-raleway">
              {t('register.subtitle')}
            </Text>

            {/* QR Scanner Button */}
            <Pressable
              onPress={() => setScannerVisible(true)}
              className="bg-white/15 border border-white/30 rounded-xl py-4 px-5 mb-md flex-row items-center justify-center"
            >
              <Ionicons name="qr-code" size={24} color="white" />
              <Text className="text-white font-raleway-bold text-base ml-3">
                {t('register.scanQr')}
              </Text>
            </Pressable>

            <Text className="text-gray-400 text-center mb-md font-raleway text-sm">
              {t('register.orEnterManually')}
            </Text>

            {/* Invitation code field with validation indicator */}
            <View className="mb-md">
              <Input
                label={t('register.invitationLabel')}
                placeholder={t('register.invitationPlaceholder')}
                value={form.invitationCode}
                onChangeText={(v) => {
                  updateField('invitationCode', v);
                  setCodeValidation({});
                }}
                error={errors.invitationCode}
                autoCapitalize="characters"
                autoCorrect={false}
                containerClassName="w-full"
              />
              {codeValidation.checking && (
                <View className="flex-row items-center mt-1 ml-1">
                  <ActivityIndicator size="small" color="#22c55e" />
                  <Text className="text-gray-300 text-xs ml-2">Checking code...</Text>
                </View>
              )}
              {codeValidation.valid && codeValidation.role && (
                <View className="flex-row items-center mt-1 ml-1">
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text className="text-green-400 text-xs ml-1">
                    {t('register.codeScanned', { code: form.invitationCode })}
                  </Text>
                </View>
              )}
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
            />

            <Input
              label={t('register.displayNameLabel')}
              placeholder={t('register.displayNamePlaceholder')}
              value={form.displayName}
              onChangeText={(v) => updateField('displayName', v)}
              error={errors.displayName}
              containerClassName="w-full mb-md"
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
            />

            <Input
              label={t('register.passwordLabel')}
              placeholder={t('register.passwordPlaceholder')}
              value={form.password}
              onChangeText={(v) => updateField('password', v)}
              error={errors.password}
              secureTextEntry
              containerClassName="w-full mb-md"
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
            />

            <Button
              title={t('register.submit')}
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              fullWidth
              className="bg-success mt-md"
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
