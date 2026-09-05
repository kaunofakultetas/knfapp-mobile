// -----------------------------------------------------------
//  [*] notifyEngine — the app's NotifyEngine singleton
//
//  @knf/notifyengine composed with the app's pieces: the KNF
//  transport, the Expo device adapter (EAS project id from app
//  config) behind a real-hardware gate, AsyncStorage as the
//  key-value seam, the channel registry, the foreground policy,
//  the current app language, the stored session as the
//  register gate and the app's one error sink. The engine is a
//  MODULE-LEVEL singleton on purpose — fast refresh re-runs
//  components, not this module, so the device listeners are
//  installed once and every screen, context and host shares
//  one set of stores.
//
//  Nothing here registers a token or applies a channel by
//  itself: hosts await readyNotifyEngine() first, which runs
//  the legacy master-switch migration and init() exactly once.
//  That ordering is load-bearing — a user who switched push
//  off in the previous app version must never be re-registered
//  by a session restore that beat the migration.
//
//  Split into:
//
//    NOTIFY_CHANNELS           — the Android channel registry
//    notifyChannelNames        — nameKey → localized display name
//    NOTIFY_PRESENTATION       — the foreground policy
//    currentLanguage           — i18n language → 'lt' | 'en'
//    migrateLegacyMasterSwitch — one-time legacy opt-out bridge
//    createNotifyDevice        — the Expo adapter, hardware-gated
//    notifyEngine              — the singleton
//    readyNotifyEngine         — memoised migrate + init
// -----------------------------------------------------------

// The key-value seam and the legacy settings blob
import AsyncStorage from '@react-native-async-storage/async-storage';

// EAS project id — the push token is minted against it
import Constants from 'expo-constants';

// Real hardware or a simulator — the one question the Expo
// adapter cannot answer for itself
import * as Device from 'expo-device';

// Register payload language + channel-name language
import i18n from '@/i18n';

// Brand color for the notification light — never raw hex here
import { palettes } from '@/constants/theme';

// Every swallowed engine failure leaves a trace
import { logError } from '@/services/log';

// The backend seam
import { notifyTransport } from '@/services/notifyTransport';

// The register gate — only a signed-in session may claim a token
import { getStoredToken } from '@/services/session';

import {
  ChannelImportance,
  createExpoDevice,
  createNotifyEngine,
  type ChannelSpec,
  type DeviceAdapter,
  type KeyValueStorage,
  type Language,
  type NotifyEngine,
  type PresentationPolicy,
} from '@knf/notifyengine';


// The engine's own master-switch key (absent = enabled) and the
// settings blob the previous app version persisted through
// AppContext — its `notifications` boolean WAS the master switch
const MASTER_KEY = 'notify.masterEnabled';
const LEGACY_SETTINGS_KEY = 'app_settings';







// -----------------------------------------------------------
// NOTIFY_CHANNELS
// -----------------------------------------------------------
//
// Exactly one channel, and its id is frozen at 'default': the
// backend pushes every notification with channelId "default",
// so a renamed or versioned id would leave Android displaying
// on a channel the app never configured. Importance stays MAX
// and the vibration pattern stays [0, 250, 250, 250] for parity
// with the channel the shipped app already created under this
// id — Android freezes both per id at creation, so declaring
// anything else here would silently do nothing on every
// installed device, and a fresh install must buzz exactly like
// the ones already out there.
//
// Used by:
//   - notifyEngine (below) — the registry handed to the engine
//   - __tests__/notifyEngine.test.ts — the shape, pinned
// -----------------------------------------------------------

export const NOTIFY_CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'default',
    nameKey: 'default',
    importance: ChannelImportance.MAX,
    vibration: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: palettes.light.brand,
  },
];







// -----------------------------------------------------------
// notifyChannelNames
// -----------------------------------------------------------
//
//   notifyEngine.applyChannels(notifyChannelNames(t))
//
// The registry's nameKeys → the user-visible channel names, in
// whatever language `t` speaks. The name shows in the system
// settings, so the host re-applies it on every language switch.
//
// Used by:
//   - components/notify/NotifyEngineHost.tsx — the startup
//     apply and the language-switch re-apply
//   - __tests__/notifyEngine.test.ts — the mapping, pinned
// -----------------------------------------------------------

export function notifyChannelNames(t: (key: string) => string): Record<string, string> {
  return { default: t('settings.notifications') };
}







// -----------------------------------------------------------
// NOTIFY_PRESENTATION
// -----------------------------------------------------------
//
// Every push shows in the foreground — banner, list, sound and
// badge — matching the shipped handler. No suppress predicate
// yet: silencing the chat room that is already on screen needs
// the active-conversation signal wired into this module, and
// until then a visible duplicate beats a lost notification.
//
// Used by:
//   - notifyEngine (below) — the engine's foreground handler
// -----------------------------------------------------------

export const NOTIFY_PRESENTATION: PresentationPolicy = {
  rules: {},
  default: { banner: true, list: true, sound: true, badge: true },
};







// -----------------------------------------------------------
// currentLanguage
// -----------------------------------------------------------
//
// The language the register payload carries, so push copy
// arrives in the user's language. Anything that is not English
// is Lithuanian — the catalog has exactly those two and lt is
// the fallback everywhere else in the app.
//
// Used by:
//   - notifyEngine (below) — read at every register() call
// -----------------------------------------------------------

export function currentLanguage(): Language {
  return i18n.language === 'en' ? 'en' : 'lt';
}







// -----------------------------------------------------------
// migrateLegacyMasterSwitch
// -----------------------------------------------------------
//
// The previous app version kept the push master switch as the
// `notifications` boolean inside AppContext's 'app_settings'
// blob; the engine keeps its own key. Bridge the one case that
// matters: the engine key is ABSENT and the legacy blob says
// false → write '0', so the engine sees the switch off before
// the first register() ever runs. Everything else (key already
// present, blob says true, blob missing or corrupt) is a no-op,
// so the call is idempotent and cheap on every launch.
//
// Never throws — a broken storage read must not stop the
// engine from starting; the failure is logged instead.
//
// Used by:
//   - readyNotifyEngine (below) — before init()
// -----------------------------------------------------------

export async function migrateLegacyMasterSwitch(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(MASTER_KEY)) !== null) return;

    const raw = await AsyncStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return;

    const parsed: unknown = JSON.parse(raw);
    const legacyOff =
      !!parsed && typeof parsed === 'object' && (parsed as { notifications?: unknown }).notifications === false;
    if (legacyOff) await AsyncStorage.setItem(MASTER_KEY, '0');
  } catch (err) {
    logError('notify:migrate', err);
  }
}







// -----------------------------------------------------------
// createNotifyDevice
// -----------------------------------------------------------
//
// The Expo device adapter with one more answer folded into
// supportsRemotePush(). The adapter knows the RUNTIME (web has
// no push transport, the shared dev shell lost Android push)
// but not the HARDWARE: a simulator passes every runtime check
// and polls 'granted', then fails at token minting — which the
// engine can only report as a 'network' failure that leaves
// the settings switch quietly ON. Gating on real hardware turns
// that into the typed 'unsupported' state instead: the
// permission snapshot reads 'unsupported', register() rejects
// 'unsupported' before touching the wire, and the settings gate
// shows its unsupported note — the answer the shipped app gave
// on simulators.
//
// Used by:
//   - notifyEngine (below) — the engine's device seam
// -----------------------------------------------------------

// app.json extra.eas.projectId — `extra` is untyped in the
// config, so only a real string reaches the device adapter
const easProjectId = (): string | undefined => {
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof projectId === 'string' ? projectId : undefined;
};

function createNotifyDevice(): DeviceAdapter {
  const base = createExpoDevice({ projectId: easProjectId() });
  return { ...base, supportsRemotePush: () => Device.isDevice && base.supportsRemotePush() };
}







// -----------------------------------------------------------
// notifyEngine
// -----------------------------------------------------------
//
// The one engine instance. Built at module load so its
// identity survives fast refresh and every consumer subscribes
// to the same stores; nothing side-effecting runs until
// readyNotifyEngine() calls init().
//
// Used by:
//   - components/notify/NotifyEngineHost.tsx — init, channels,
//     tap routing
//   - context/AuthContext.tsx — register on login/restore,
//     detach on logout
//   - app/(main)/tabs/settings.tsx — the settings panel's engine
//   - app/index.tsx — the cold-start consumeInitial
// -----------------------------------------------------------

// AsyncStorage → the engine's KeyValueStorage seam
const storage: KeyValueStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  del: (key) => AsyncStorage.removeItem(key),
};

export const notifyEngine: NotifyEngine = createNotifyEngine({
  transport: notifyTransport,
  device: createNotifyDevice(),
  storage,
  channels: [...NOTIFY_CHANNELS],
  presentation: NOTIFY_PRESENTATION,
  language: currentLanguage,
  // The register endpoint is per-user, so a guest's attempt
  // could only be a 401 on the wire: the stored session is the
  // gate. A guest switching the master ON still records the
  // intent in storage, and the login's register('login') claims
  // the token afterwards
  canRegister: async () => (await getStoredToken()) !== null,
  onError: (scope, err) => logError(`notify:${scope}`, err),
});







// -----------------------------------------------------------
// readyNotifyEngine
// -----------------------------------------------------------
//
//   const engine = await readyNotifyEngine();
//
// Memoised: the first caller runs migrateLegacyMasterSwitch()
// and then init() ONCE; every later caller awaits that same
// promise. Every host that registers a token or applies the
// channels awaits this first — the legacy opt-out has to land
// in storage before the first register() reads the master
// switch, or a restored session would re-subscribe a user who
// switched push off in the old version.
//
// NEVER rejects: an init failure is logged and the engine is
// still handed back, because the stores, the settings panel
// and the detach-on-logout path all work without a completed
// init.
//
// Used by:
//   - components/notify/NotifyEngineHost.tsx — startup
//   - context/AuthContext.tsx — before register/detach
//   - app/(main)/tabs/settings.tsx — before the first server read
// -----------------------------------------------------------

let readyPromise: Promise<NotifyEngine> | null = null;

const becomeReady = async (): Promise<NotifyEngine> => {
  await migrateLegacyMasterSwitch();
  try {
    await notifyEngine.init();
  } catch (err) {
    logError('notify:init', err);
  }
  return notifyEngine;
};

export function readyNotifyEngine(): Promise<NotifyEngine> {
  if (!readyPromise) readyPromise = becomeReady();
  return readyPromise;
}
