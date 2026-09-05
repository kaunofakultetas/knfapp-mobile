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
//  would race hydration: isAuthenticated stays false until the
//  stored session loads, and router.replace unmounts this
//  screen, so a logged-in user would be bounced to onboarding
//  on every cold start.
//
//  Cold-start notification taps land HERE too: once both gates
//  pass, the launch response is consumed from the notify
//  engine exactly ONCE per mount — the promise lives in a ref,
//  so a dependency change while the consume is in flight
//  re-uses the already-consumed intent instead of asking the
//  engine again (the engine answers a second ask with null: it
//  clears the device copy and remembers the identifier) — and
//  routed through the same type→screen map the warm path uses.
//  A first-run guest consumes the tap as well, and DISCARDS
//  it: they have nowhere to land yet, and a tap left behind
//  could route a guest into a room later. Only the navigation
//  of a superseded run is cancelled, never the consume.
//
//  Every branch ends by settling the launch gate in
//  services/notifyRouting, after its navigation call and after
//  the consume finished: the warm resolver in
//  components/notify/NotifyEngineHost.tsx waits for that gate,
//  so it can never flush the launch tap as a warm tap over the
//  splash. A run that unmounts mid-consume settles nothing —
//  the gate's own timeout covers it.
// -----------------------------------------------------------

// Redirect target and waiting state
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

// The two facts the redirect depends on
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

// The cold-start tap that may override the landing screen, the
// one map that turns it into a route, and the gate the warm
// resolver waits behind
import { notifyEngine } from '@/services/notifyEngine';
import { routeNotificationIntent, settleLaunchRouting } from '@/services/notifyRouting';

import type { RouteIntent } from '@knf/notifyengine';


// The launch response as a route intent, or null when there
// was none — or when the device layer cannot answer at all
// (web, a missing native module): the default route wins
const launchIntent = async (): Promise<RouteIntent | null> => {
  try {
    return await notifyEngine.routing.consumeInitial();
  } catch {
    return null;
  }
};







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


  // The one consume this mount makes, started the first time
  // the gates pass and shared by every later effect run — the
  // engine hands the tap out once, so re-asking would lose it
  const launchRef = useRef<Promise<RouteIntent | null> | null>(null);


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
  // was a notification tap, the tap picks the landing screen.
  // The consume is async and shared (the ref), so a dependency
  // change or an unmount mid-await cancels only THIS run's
  // navigation — the re-run routes the same intent with the
  // current facts rather than letting a stale decision
  // navigate over the newer one
  useEffect(() => {
    if (!hydrated || onboarded === null) return;

    if (!isAuthenticated && !onboarded) {
      // Consumed and discarded on purpose (file header); the
      // gate opens once the discard is done, so the warm
      // resolver cannot pick the tap up either
      const discarded = (launchRef.current ??= launchIntent());
      router.replace('/login');
      void discarded.then(() => settleLaunchRouting());
      return;
    }

    let cancelled = false;
    const launch = (launchRef.current ??= launchIntent());

    void launch.then((intent) => {
      if (cancelled) return;
      if (!intent || !routeNotificationIntent(intent, router)) router.replace('/(main)/tabs/news');
      settleLaunchRouting();
    });

    return () => {
      cancelled = true;
    };
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
