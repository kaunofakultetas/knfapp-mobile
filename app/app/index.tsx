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
//
//  Cold-start notification taps land HERE too: the launch
//  response picks the redirect target (chat room, schedule)
//  and is cleared after routing so it never replays. The warm
//  tap listener lives in app/_layout.tsx.
// -----------------------------------------------------------

// Redirect target and waiting state
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

// The two facts the redirect depends on
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

// The cold-start tap that may override the landing screen
import * as Notifications from 'expo-notifications';
import { getNotificationData } from '@/services/notifications';







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
  const { t } = useTranslation();


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
  // so back can never return to this splash. When the launch
  // was a notification tap, the tap picks the landing screen;
  // the response is cleared so it cannot route a second time
  useEffect(() => {
    if (!hydrated || onboarded === null) return;

    if (!isAuthenticated && !onboarded) {
      router.replace('/login');
      return;
    }

    let data: Record<string, string> | null = null;
    try {
      const response = Notifications.getLastNotificationResponse();
      data = response ? getNotificationData(response.notification) : null;
      if (data) Notifications.clearLastNotificationResponse();
    } catch {
      // Web or a missing native module — take the default route
    }

    if ((data?.type === 'chat_message' || data?.type === 'chat_mention') && data.conversationId) {
      // Land on the messages tab first so back from the room
      // goes somewhere sensible, then push the room itself
      router.replace('/(main)/tabs/messages');
      router.push({
        pathname: '/(main)/chat-room',
        params: { conversationId: data.conversationId, title: '' },
      });
    } else if (data?.type === 'schedule_update') {
      router.replace('/(main)/tabs/schedule');
    } else {
      router.replace('/(main)/tabs/news');
    }
  }, [hydrated, onboarded, isAuthenticated, router]);


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
