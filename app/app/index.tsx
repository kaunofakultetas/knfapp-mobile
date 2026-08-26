// -----------------------------------------------------------
//  [*] App — entry redirect
//
//  The launch decision: authenticated users and returning
//  guests go straight to the news feed, first-run users get
//  the onboarding/login screen. A brand splash shows while
//  the decision is pending.
//
//  The decision waits for TWO async facts — AuthContext
//  session hydration (the `hydrated` flag) and the
//  AsyncStorage 'onboarded' read. Deciding on first render
//  used to race hydration: isAuthenticated stays false until
//  the stored session loads, and router.replace unmounts this
//  screen, so a logged-in user was bounced to onboarding on
//  every cold start.
// -----------------------------------------------------------

// Redirect target and waiting state
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

// The two facts the redirect depends on
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';







// -----------------------------------------------------------
// IndexScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — route '/'
// -----------------------------------------------------------

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuth();
  const { colors } = useTheme();


  // null = still reading; login/register set 'onboarded' after
  // success, guest links set it on first skip
  const [onboarded, setOnboarded] = useState<boolean | null>(null);


  // Read the onboarded flag once; an unreadable store counts
  // as not onboarded (worst case: an extra trip through login)
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem('onboarded')
      .then((value) => {
        if (!cancelled) setOnboarded(value !== null);
      })
      .catch(() => {
        if (!cancelled) setOnboarded(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);


  // Redirect only once both facts are in — replace (not push)
  // so back can never return to this splash
  useEffect(() => {
    if (!hydrated || onboarded === null) return;

    if (isAuthenticated || onboarded) {
      router.replace('/(main)/tabs/news');
    } else {
      router.replace('/login');
    }
  }, [hydrated, onboarded, isAuthenticated, router]);


  return (
    <View className="flex-1 items-center justify-center bg-brand">
      <ActivityIndicator size="large" color={colors.onBrand} />
    </View>
  );
}
