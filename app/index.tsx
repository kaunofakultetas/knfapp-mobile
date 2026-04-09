import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const redirect = async () => {
      const hasOnboarded = await AsyncStorage.getItem('onboarded');

      if (isAuthenticated || hasOnboarded) {
        // Authenticated users and returning guests go straight to the app
        router.replace('/(main)/tabs/news');
      } else {
        // First-time users see the onboarding/login screen
        router.replace('/login');
      }
    };
    redirect();
  }, [router, isAuthenticated]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
      <Text style={{ fontSize: 18, color: '#7B003F' }}>{t('common.loading')}</Text>
    </View>
  );
}