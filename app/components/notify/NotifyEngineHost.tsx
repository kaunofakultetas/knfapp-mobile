// -----------------------------------------------------------
//  [*] Notify — NotifyEngineHost
//
//  The root-level glue between @knf/notifyengine's singleton
//  and the running app: the readiness kick (legacy master-
//  switch migration, then init), the ONE resolver that turns a
//  warm notification tap into navigation, the Android channel
//  names in the active language, and the two re-registrations
//  the engine cannot decide alone — a language switch (the
//  dedupe tuple misses on a new language, so the backend must
//  hear it to switch its push copy) and a permission grant
//  from the OS prompt or the settings gate (no token was ever
//  acquired while permission was denied).
//
//  Renders nothing. The engine is a process singleton, so this
//  host never disposes it — a fast-refresh remount re-installs
//  the resolver and re-applies the channels, both idempotent,
//  and leaves the device listeners exactly as init left them.
//
//  Readiness is kicked the moment this mounts, the resolver is
//  installed only AFTER app/index.tsx has settled the launch
//  decision — and the two orders are load-bearing together.
//  init installs the device listeners, and the platform can
//  replay the tap that launched the app to a listener
//  installed after the fact, so on a cold start that tap may
//  reach the engine as a warm event; with no resolver in
//  place it sits in the routing buffer, from where index.tsx's
//  consumeInitial() adopts it as the cold-start intent (replace
//  semantics, after the hydration and onboarding gates). A
//  resolver installed any earlier would flush the buffer and
//  route the launch tap as a warm one — dismissTo over a stack
//  holding nothing but the splash. Once the gate settles (or
//  its timeout lapses for a launch that never renders index),
//  the resolver goes in and every intent buffered meanwhile is
//  flushed to it in order — never dropped.
//
//  The startup permission poll is a READ, not a grant: the
//  store starts at 'unknown', and the first real snapshot must
//  not fire a register — a restored session registers through
//  AuthContext after /me, not from here.
//
//  Used by:
//    - app/_layout.tsx — inside AppNavigation, next to the Stack
// -----------------------------------------------------------

// The router the resolver navigates with
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Auth gates both re-registrations; every swallowed failure
// leaves a trace
import { useAuth } from '@/context/AuthContext';
import { logError } from '@/services/log';

// The singleton, its readiness memo, the channel names, the
// one type→screen map and the launch gate the resolver waits on
import { notifyChannelNames, notifyEngine, readyNotifyEngine } from '@/services/notifyEngine';
import { launchRoutingSettled, routeNotificationIntent } from '@/services/notifyRouting';







// -----------------------------------------------------------
// NotifyEngineHost (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/_layout.tsx — AppNavigation, once
// -----------------------------------------------------------

export default function NotifyEngineHost(): null {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();
  const language = i18n.language;


  // The async paths below read auth when they COMPLETE, not
  // when they were scheduled — a login that lands while the
  // engine is still becoming ready must count, and a logout
  // must stop a register that was queued behind readiness
  const authenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    authenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);


  // Readiness first thing, and nothing waits for it: init
  // installs the device listeners, and the sooner they exist
  // the sooner a replayed launch tap lands in the engine's
  // buffer instead of being missed
  useEffect(() => {
    void readyNotifyEngine();
  }, []);


  // The resolver waits for the launch gate (file header); an
  // already-settled gate resolves at once, so a later router
  // identity re-points the hub without a visible gap. The
  // cancel flag keeps a superseded run (router change or
  // unmount mid-wait) from installing a resolver bound to a
  // router nothing renders any more — setResolver replaces,
  // so the newest run always wins
  useEffect(() => {
    let cancelled = false;

    void launchRoutingSettled().then(() => {
      if (cancelled) return;
      notifyEngine.routing.setResolver((intent) => {
        routeNotificationIntent(intent, router);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [router]);


  // Channel names follow the UI language (the name shows in
  // Android's system settings); a SWITCH, not the first run,
  // also re-registers so the backend's push copy changes too.
  // `t` re-binds on the same language event, so both deps move
  // together; the ref tells the first run from a real switch
  const previousLanguage = useRef(language);

  useEffect(() => {
    const switched = previousLanguage.current !== language;
    previousLanguage.current = language;

    void (async () => {
      const engine = await readyNotifyEngine();
      await engine.applyChannels(notifyChannelNames(t));
      if (switched && authenticatedRef.current && engine.prefs.get().masterEnabled) {
        await engine.register('language');
      }
    })().catch((err) => logError('notify:language', err));
  }, [language, t]);


  // A grant from the OS prompt or the settings deep-link:
  // register without asking the user for another toggle. Only
  // a false→true edge whose PREVIOUS snapshot was a real read
  // counts — the store starts at 'unknown' and init's poll
  // turns that into the first fact, which is a read of what the
  // OS already had, not a grant (file header). subscribe
  // replays the current value first, so the seed is taken
  // before subscribing; an already-registered token is left
  // alone
  useEffect(() => {
    let previous = notifyEngine.permission.get();

    return notifyEngine.permission.subscribe((snapshot) => {
      const granted = previous.status !== 'unknown' && !previous.canDeliver && snapshot.canDeliver;
      previous = snapshot;
      if (!granted || !authenticatedRef.current) return;
      if (!notifyEngine.prefs.get().masterEnabled) return;
      if (notifyEngine.registration.get().phase === 'registered') return;

      readyNotifyEngine()
        .then((engine) => engine.register('restore'))
        .catch((err) => logError('notify:permission', err));
    });
  }, []);


  return null;
}
