// -----------------------------------------------------------
//  [*] notifyRouting — notification type → screen
//
//  The ONE place a tapped notification's `type` becomes
//  navigation. The engine hands over a normalized RouteIntent
//  and knows no routes; this module owns the map, so a new
//  push type is added here and nowhere else. Two verbs per
//  target, chosen by how the app was woken:
//
//    cold (the tap launched the app) — the stack holds only the
//      startup gate, so the target REPLACES it: a back press
//      from the target must exit, not reveal the splash;
//    warm (the app was already running) — the chat path
//      dismisses to the messages tab first so repeated taps
//      reuse one shell and one room instance, and the tab
//      targets navigate() so an already-focused tab is not
//      pushed twice.
//
//  The chat room's title is unknown at tap time — the room
//  resolves it itself, so '' is passed on purpose.
//
//  The launch gate closes a cold-start race. The engine's
//  response listener goes in at init, and the native emitter
//  may replay the launch tap through it as well as through the
//  stored last response — so a resolver already installed would
//  route the tap WARM (a dismissTo on a stack that holds only
//  the splash) before app/index.tsx ever asked, and the gate's
//  own consumeInitial() would then find it consumed and land on
//  the news tab over it. NotifyEngineHost therefore installs
//  its resolver only after launchRoutingSettled() resolves;
//  until then intents buffer in the engine's hub, and
//  consumeInitial() adopts the oldest buffered one as the cold
//  tap — the launch consumer always wins. index.tsx settles the
//  gate once its decision is made, in every branch; the timeout
//  covers a cold start that never renders index.tsx at all (a
//  deep link straight into a nested route).
//
//  Split into:
//
//    NotifyRouter            — the four router verbs used here
//    routeNotificationIntent — the type → screen map
//    settleLaunchRouting     — index.tsx opens the gate
//    launchRoutingSettled    — the host waits behind it
// -----------------------------------------------------------

import type { ImperativeRouter } from 'expo-router';

import type { RouteIntent } from '@knf/notifyengine';


// How long the warm resolver waits for a launch decision that
// may never come — long enough for hydration plus the onboarded
// read on a slow device, short enough that a deep-linked cold
// start still routes its warm taps within the first screen
const LAUNCH_SETTLE_TIMEOUT_MS = 5_000;







// -----------------------------------------------------------
// NotifyRouter
// -----------------------------------------------------------
//
// The four verbs this module needs from expo-router's router.
// Narrowed so tests hand in four jest.fn()s and so the host
// can pass useRouter()'s result straight through.
//
// Used by:
//   - routeNotificationIntent (below)
//   - __tests__/notifyRouting.test.ts — the jest.fn routers
//   - __tests__/notifyEngineHost.test.tsx — same
//   - __tests__/indexColdStart.test.tsx — same
// -----------------------------------------------------------

export type NotifyRouter = Pick<ImperativeRouter, 'replace' | 'push' | 'navigate' | 'dismissTo'>;







// -----------------------------------------------------------
// routeNotificationIntent
// -----------------------------------------------------------
//
//   routeNotificationIntent(intent, router)  → true when it navigated
//
// The type→screen map:
//
//   chat_message | chat_mention (with data.conversationId)
//     → messages tab, then the chat room pushed on top
//   news | admin_announcement → the news tab
//   schedule_update           → the schedule tab
//   anything else             → false, no navigation
//
// A chat type WITHOUT a conversationId is "anything else" — a
// room push with no id would open an empty screen.
//
// Used by:
//   - components/notify/NotifyEngineHost.tsx — the resolver
//   - app/index.tsx — the cold-start tap inside the startup gate
// -----------------------------------------------------------

export function routeNotificationIntent(intent: RouteIntent, router: NotifyRouter): boolean {
  const { type, data, coldStart } = intent;

  if ((type === 'chat_message' || type === 'chat_mention') && data.conversationId) {
    // Collapse to the messages tab first so the room sits on
    // the tab it belongs to — on a cold start the tab replaces
    // the startup gate instead of stacking on it
    if (coldStart) router.replace('/(main)/tabs/messages');
    else router.dismissTo('/(main)/tabs/messages');
    router.push({
      pathname: '/(main)/chat-room',
      params: { conversationId: data.conversationId, title: '' },
    });
    return true;
  }

  if (type === 'news' || type === 'admin_announcement') {
    if (coldStart) router.replace('/(main)/tabs/news');
    else router.navigate('/(main)/tabs/news');
    return true;
  }

  if (type === 'schedule_update') {
    if (coldStart) router.replace('/(main)/tabs/schedule');
    else router.navigate('/(main)/tabs/schedule');
    return true;
  }

  return false;
}







// -----------------------------------------------------------
// settleLaunchRouting
// -----------------------------------------------------------
//
//   settleLaunchRouting()
//
// Opens the launch gate: the startup screen has made its
// decision (and consumed or discarded the launch tap), so the
// warm resolver may take over. Idempotent — the startup effect
// re-runs on every dependency change and each run settles, and
// a call after a waiter's timeout already fired changes
// nothing. Module-level state on purpose: the gate is a fact
// about this process launch, not about any mounted component.
//
// Used by:
//   - app/index.tsx — every branch of the launch decision, after
//     its navigation call
// -----------------------------------------------------------

let settled = false;

// Whoever is waiting when the gate opens; a waiter released by
// its timeout removes itself, so the list never outgrows the
// callers still waiting
const waiters: (() => void)[] = [];

export function settleLaunchRouting(): void {
  if (settled) return;
  settled = true;
  for (const wake of waiters.splice(0)) wake();
}







// -----------------------------------------------------------
// launchRoutingSettled
// -----------------------------------------------------------
//
//   await launchRoutingSettled();        // 5 s fallback
//   await launchRoutingSettled(1_000);   // a tighter fallback
//
// Resolves once settleLaunchRouting() has run, or after the
// timeout — whichever comes first; a gate already open resolves
// at once with no timer. The timeout exists because a cold
// start into a nested route (a deep link) never renders
// index.tsx, and the warm resolver must not stay uninstalled
// forever; settling clears every pending timer so nothing keeps
// ticking after the decision.
//
// Used by:
//   - components/notify/NotifyEngineHost.tsx — before installing
//     the resolver, on mount and on every router identity change
// -----------------------------------------------------------

export function launchRoutingSettled(timeoutMs: number = LAUNCH_SETTLE_TIMEOUT_MS): Promise<void> {
  if (settled) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Already emptied when settle() is the caller
      const at = waiters.indexOf(finish);
      if (at >= 0) waiters.splice(at, 1);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    waiters.push(finish);
  });
}
