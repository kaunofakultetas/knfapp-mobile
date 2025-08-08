import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { LoginForm } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, Text, TouchableWithoutFeedback, View } from 'react-native';
import Swiper from 'react-native-swiper';
import LogoKnF from '../components/logoknf.svg';

interface WelcomePageProps {}

function WelcomePage({}: WelcomePageProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 justify-center items-center bg-primary">
      <View className="flex-1 pt-[50px]">
        <LogoKnF
          width={200}
          height={300}
          className="self-center"
        />
      </View>
      
      <View className="absolute bottom-0 left-0 right-0 justify-center items-center mb-[15%] px-lg">
        <Text className="text-white font-raleway-bold text-2xl">
          {t('login.welcomeTitle')}
        </Text>
        
        <Text className="text-gray-300 text-base mt-lg text-center leading-base font-raleway">
          {t('login.subtitle')}
        </Text>
        
        <Button
          title={t('login.continue')}
          variant="primary"
          size="lg"
          fullWidth
          className="bg-info shadow-lg my-2xl rounded-full"
          onPress={async () => {
            await AsyncStorage.setItem('onboarded', '1');
          }}
        />
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
      Alert.alert(
        t('login.errorTitle'),
        t('login.errorMessage'),
        [{ text: t('common.ok') }]
      );
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
        />
        <Pressable onPress={() => Alert.alert(t('login.forgotPassword'), 'SSO bus integruotas vėliau')}
          className="self-end mb-md">
          <Text className="text-white">{t('login.forgotPassword')}</Text>
        </Pressable>

        <Button
          title={t('login.signIn')}
          onPress={handleLogin}
          loading={loading}
          disabled={!formData.username || !formData.password}
          fullWidth
          className="mt-lg bg-success"
        />

        <View className="mt-md">
          <Button
            title={t('login.sso')}
            variant="outline"
            onPress={() => Alert.alert('SSO', t('login.ssoComingSoon'))}
          />
        </View>
      </View>
    </View>
  );
}

export default function LoginScreen() {
  return (
    <KeyboardAvoidingView className="flex-1 bg-primary" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView className="flex-1 items-center justify-center p-lg w-full">
          <Swiper loop={false} showsPagination>
            <WelcomePage />
            <LoginPage />
          </Swiper>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
