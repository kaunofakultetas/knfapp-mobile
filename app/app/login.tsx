import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { LoginForm } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, Text, TouchableWithoutFeedback, View } from 'react-native';
import Swiper from 'react-native-swiper';
import LogoKnF from '../components/logoknf.svg';

interface WelcomePageProps {}

function WelcomePage({}: WelcomePageProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleContinueAsGuest = async () => {
    await AsyncStorage.setItem('onboarded', '1');
    router.replace('/(main)/tabs/news');
  };

  return (
    <View className="flex-1 justify-between items-center bg-primary px-lg" style={{ paddingTop: 48, paddingBottom: 40 }}>
      <View className="items-center" style={{ marginTop: 20 }}>
        <LogoKnF
          width={180}
          height={260}
          className="self-center"
        />
      </View>

      <View className="items-center w-full">
        <Text className="text-white font-raleway-bold text-2xl text-center">
          {t('login.welcomeTitle')}
        </Text>

        <Text className="text-gray-300 text-base mt-md text-center leading-base font-raleway">
          {t('login.subtitle')}
        </Text>

        <Button
          title={t('login.continue')}
          variant="outline"
          size="lg"
          fullWidth
          className="bg-white border-white shadow-lg mt-xl rounded-full"
          textClassName="text-primary font-raleway-bold"
          onPress={async () => {
            await AsyncStorage.setItem('onboarded', '1');
          }}
        />

        <Pressable onPress={handleContinueAsGuest} className="mt-md">
          <Text className="text-gray-300 font-raleway text-base underline">
            {t('login.continueAsGuest')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface LoginPageProps {}

function LoginPage({}: LoginPageProps) {
  const router = useRouter();
  const { login, loading } = useAuth();
  const { t } = useTranslation();
  const [formData, setFormData] = useState<LoginForm>({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<LoginForm>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginForm> = {};
    
    if (!formData.username.trim()) {
      newErrors.username = t('login.errors.usernameRequired');
    }
    
    if (!formData.password.trim()) {
      newErrors.password = t('login.errors.passwordRequired');
    } else if (formData.password.length < 6) {
      newErrors.password = t('login.errors.passwordMin');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    
    try {
      await login(formData.username, formData.password);
      router.replace('/(main)/tabs/news');
    } catch (error) {
      showToast('error', t('login.errorTitle'), t('login.errorMessage'));
    }
  };

  const updateField = (field: keyof LoginForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <View className="flex-1 justify-center items-center bg-primary">
      <View className="flex-1 items-center justify-center p-lg w-full">
        <Text className="text-3xl mb-xl text-white font-raleway-bold">
          {t('login.title')}
        </Text>
        
        <Input
          label={t('login.usernameLabel')}
          placeholder={t('login.usernamePlaceholder')}
          value={formData.username}
          onChangeText={(value) => updateField('username', value)}
          error={errors.username}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => {}}
          containerClassName="w-full mb-md"
          labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
        />

        <Input
          label={t('login.passwordLabel')}
          placeholder={t('login.passwordPlaceholder')}
          value={formData.password}
          onChangeText={(value) => updateField('password', value)}
          error={errors.password}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          containerClassName="w-full mb-md"
          labelClassName="text-sm font-raleway-medium text-white/90 mb-xs"
        />
        <Pressable onPress={() => showToast('info', t('login.forgotPassword'), t('login.ssoComingSoon'))}
          className="self-end mb-lg">
          <Text className="text-white/70 text-sm font-raleway">{t('login.forgotPassword')}</Text>
        </Pressable>

        <Button
          title={t('login.signIn')}
          onPress={handleLogin}
          loading={loading}
          disabled={!formData.username || !formData.password}
          fullWidth
          className="mt-lg bg-white rounded-full"
          textClassName="text-primary font-raleway-bold"
        />

        <View className="mt-md">
          <Button
            title={t('login.sso')}
            variant="outline"
            onPress={() => showToast('info', 'SSO', t('login.ssoComingSoon'))}
          />
        </View>

        <Pressable onPress={() => router.push('/register')} className="mt-lg">
          <Text className="text-white font-raleway text-center">
            {t('login.noAccount')}{' '}
            <Text className="font-raleway-bold underline">{t('login.register')}</Text>
          </Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await AsyncStorage.setItem('onboarded', '1');
            router.replace('/(main)/tabs/news');
          }}
          className="mt-md"
        >
          <Text className="text-gray-300 font-raleway text-center underline">
            {t('login.continueAsGuest')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const [initialIndex, setInitialIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const hasOnboarded = await AsyncStorage.getItem('onboarded');
      // If user already onboarded, skip welcome and show login form directly
      setInitialIndex(hasOnboarded ? 1 : 0);
    })();
  }, []);

  // Wait until we know which page to show
  if (initialIndex === null) {
    return (
      <View className="flex-1 bg-primary items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-primary" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView className="flex-1 items-center justify-center p-lg w-full">
          <Swiper loop={false} showsPagination index={initialIndex}>
            <WelcomePage />
            <LoginPage />
          </Swiper>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
