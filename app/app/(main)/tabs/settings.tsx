// -----------------------------------------------------------
//  [*] Tabs — Settings
//
//  Device-local preferences plus the account section. The
//  whole screen works logged out: guests get every preference
//  and a friendly login card; an account adds the logout
//  button, the backend notification-channel switches and the
//  admin link (admin/curator roles only).
//
//  The notification block is the kit's: PermissionGate decides
//  whether the OS lets us deliver at all (prompt card, open-
//  settings card, or the honest "no push here" note), and
//  NotifySettingsPanel renders the master switch, the four
//  channel rows and the chat-preview flag straight off the
//  engine's prefs store. Debounced saves, batch rollback and
//  the guest gate (a signed-out master-ON records the intent,
//  answers 'unauthenticated' and never touches the wire —
//  login claims the token) are the engine's; the master-ON
//  snap-back is the kit's. This screen adds only what neither
//  can know: whether there is an account to read server truth
//  from (guests see the master row alone), whether THIS
//  screen's own read of that truth has landed (rows stay
//  locked behind a retry row until it does — the prefs store
//  is a process-wide singleton, so a 'fresh' left behind by
//  the previous account must never unlock the next account's
//  rows), and the app's toasts.
//
//  The kit is structural and owns no strings, so the toasts
//  ride on a FACADE over the engine: the panel and the reset
//  talk to the facade, which forwards every call and speaks
//  where the engine is silent — a master-ON that failed on the
//  wire (toast.networkError, switch left ON: the intent is
//  stored and the next register re-asserts it) and a chat-
//  preview save the engine reverted (channelUpdateError).
//
//  Reset restores device-local defaults only — the backend
//  channel switches are account state and stay. Because the
//  defaults mean push ON, reset also flips the engine's master
//  switch back on (and snaps it off again, with the reason,
//  when delivery is impossible). The language re-sync after
//  reset happens inside AppContext (its i18n effect follows
//  the language setting), not here.
//
//  Split into (root component last):
//
//    SegmentedControl  — theme / language option pills
//    LinkRow           — chevron navigation row
//    ChannelsRetryRow  — the failed-load row with Try again
//    UserCard          — avatar + identity + logout
//    GuestCard         — login prompt for guests
//    useChannelsSync   — per-session server-truth read + latch
//    SettingsScreen    — the tab itself (default export)
// -----------------------------------------------------------

// Device-local settings and the session
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// The resolved base URL renders in the footer so a
// misconfigured build is distinguishable from being offline
import { API_BASE_URL } from '@/services/api';

// The one engine: permission, master switch and server truth
// all read from its stores; readyNotifyEngine gates the first
// read behind the legacy master-switch migration
import { notifyEngine, readyNotifyEngine } from '@/services/notifyEngine';

// UI kit and JS-side colors
import {
  Avatar,
  Button,
  Card,
  Header,
  RefreshSpinner,
  Screen,
  SectionTitle,
  confirmAction,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Param-preserving current href for the login returnTo
import { useReturnHref } from '@/hooks/useReturnHref';

// Icons, navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

// The session user shown on the account card
import type { User } from '@/types';

import {
  NotifySettingsPanel,
  PermissionGate,
  useStoreValue,
  type NotifyColors,
  type NotifySettingsIcons,
  type NotifySettingsLabels,
  type PermissionGateLabels,
} from '@knf/notifyuikit';


// One selectable pill of a SegmentedControl; a11yLabel lets a
// terse visible label ("LT") announce as its full language name
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  a11yLabel?: string;
}

interface LinkRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  divider?: boolean;
}

// The reasons a master-ON cannot be honoured — each has its
// own toast, shared by the panel's onBlocked and the reset
type BlockedReason = 'permission' | 'unsupported';

// The channel-row latch: the session it belongs to, the
// generation its reads are stamped with, and whether one landed
interface ChannelsLatch {
  session: boolean;
  generation: number;
  loaded: boolean;
}







// -----------------------------------------------------------
// SegmentedControl
// -----------------------------------------------------------
//
// A row of option pills on a surface-soft track; the selected
// pill fills brand. `fullWidth` stretches the pills evenly
// (the three-way theme row); without it the control hugs its
// content (the LT/EN pair). Pills are 36pt tall — hitSlop
// restores the 44pt target.
//
// Used by:
//   - SettingsScreen (below) — theme and language rows
// -----------------------------------------------------------

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  fullWidth?: boolean;
}) {

  return (
    <View
      className={
        fullWidth
          ? 'flex-row rounded-md bg-surface-soft p-xs'
          : 'flex-row self-start rounded-md bg-surface-soft p-xs'
      }
    >
      {options.map((option) => {
        // Re-selecting the active pill is a no-op upstream —
        // AppContext just re-dispatches the same value
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            className={[
              // min-h so scaled accessibility text grows the
              // pill instead of overflowing it
              'min-h-9 items-center justify-center rounded-sm px-md py-xs',
              fullWidth ? 'flex-1' : '',
              selected ? 'bg-brand' : '',
            ].join(' ')}
            hitSlop={6}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.a11yLabel ?? option.label}
            accessibilityState={{ selected }}
          >
            <Text
              className={
                selected
                  ? 'text-sm font-raleway-semibold text-on-brand'
                  : 'text-sm font-raleway-medium text-ink-soft'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}







// -----------------------------------------------------------
// LinkRow
// -----------------------------------------------------------
//
// A pressable navigation row with a trailing chevron; pressed
// state tints surface-soft like every other pressed row.
//
// Used by:
//   - SettingsScreen (below) — faculty info and admin links
// -----------------------------------------------------------

function LinkRow({ icon, label, onPress, divider = false }: LinkRowProps) {

  const { colors } = useTheme();


  return (
    <Pressable
      className={
        divider
          ? 'flex-row items-center gap-sm border-b border-line px-md py-md'
          : 'flex-row items-center gap-sm px-md py-md'
      }
      style={({ pressed }) =>
        pressed ? { backgroundColor: colors.surfaceSoft } : undefined
      }
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text className="flex-1 font-raleway-medium text-base text-ink">{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// ChannelsRetryRow
// -----------------------------------------------------------
//
// The compact row shown when the first server read of the
// channel switches failed: the engine's defaults are
// placeholders, never server truth, so instead of four
// confident switches the user gets the reason and a Try again.
// The whole row is the button — the label is what a screen
// reader announces.
//
// Used by:
//   - SettingsScreen (below) — above the locked panel
// -----------------------------------------------------------

function ChannelsRetryRow({ onRetry }: { onRetry: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={t('common.tryAgain')}
      className="flex-row items-center gap-sm border-b border-line px-md py-md"
      style={({ pressed }) =>
        pressed ? { backgroundColor: colors.surfaceSoft } : undefined
      }
    >
      <Ionicons name="cloud-offline-outline" size={20} color={colors.inkSoft} />
      <Text className="flex-1 font-raleway text-sm text-ink-soft">
        {t('settings.channelsLoadError')}
      </Text>
      <Text className="font-raleway-semibold text-sm text-brand">
        {t('common.tryAgain')}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// UserCard
// -----------------------------------------------------------
//
// The signed-in account card: avatar, display name and email
// with the logout button. Name + email read to assistive tech
// as one "logged in as …" element. The logout button shows a
// spinner and locks while the logout runs, so a second tap
// can't fire it twice.
//
// Used by:
//   - SettingsScreen (below) — account section when signed in
// -----------------------------------------------------------

function UserCard({
  user,
  loggingOut,
  onLogout,
}: {
  user: User;
  loggingOut: boolean;
  onLogout: () => void;
}) {

  const { t } = useTranslation();


  return (
    <Card>
      <View className="flex-row items-center gap-md">

        <Avatar uri={user.avatarUrl} name={user.displayName} size={48} />

        <View
          className="flex-1"
          accessible
          accessibilityLabel={t('settings.loggedInAs', { name: user.displayName })}
        >
          <Text className="font-raleway-bold text-base text-ink" numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text className="mt-xs font-raleway text-sm text-ink-soft" numberOfLines={1}>
            {user.email}
          </Text>
        </View>

        <Button
          title={t('settings.logout')}
          variant="outline"
          size="sm"
          fullWidth={false}
          onPress={onLogout}
          loading={loggingOut}
          disabled={loggingOut}
        />
      </View>
    </Card>
  );
}







// -----------------------------------------------------------
// GuestCard
// -----------------------------------------------------------
//
// The logged-out account card: what an account adds, plus a
// login button carrying ?returnTo so the login screen sends
// the user straight back here afterwards.
//
// Used by:
//   - SettingsScreen (below) — account section when signed out
// -----------------------------------------------------------

function GuestCard() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  // Param-preserving href — usePathname would strip any params
  const returnTo = useReturnHref();


  return (
    <Card>
      <View className="mb-md flex-row items-center gap-md">

        {/* Decorative icon — hidden from assistive tech */}
        <View
          className="h-10 w-10 items-center justify-center rounded-full bg-brand-soft"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="person-outline" size={20} color={colors.brand} />
        </View>

        <Text className="flex-1 font-raleway text-sm leading-5 text-ink-soft">
          {t('settings.guestMessage')}
        </Text>
      </View>

      <Button
        title={t('settings.login')}
        onPress={() =>
          router.push({ pathname: '/login', params: { returnTo } })
        }
      />
    </Card>
  );
}







// -----------------------------------------------------------
// useChannelsSync
// -----------------------------------------------------------
//
//   const channels = useChannelsSync(isAuthenticated)
//     channels.loaded — a read THIS hook started landed without
//                       error this session; sticky, because a
//                       later failed save or a failed pull must
//                       not re-lock rows that already show truth
//     channels.failed — nothing loaded yet and the store's last
//                       read errored; the retry row's cue
//     channels.read() — one awaited server read that latches
//                       `loaded` when it lands; the hook fires
//                       it on sign-in, the screen on retry and
//                       pull-to-refresh
//
// The engine's prefs store is a process-wide singleton and its
// syncState a live signal ('fresh' / 'stale' / 'flushing' /
// 'error'), not a "has ever loaded" flag — so the latch lives
// here and answers to reads this hook started, never to the
// store's current value: a 'fresh' left behind by the previous
// account would otherwise unlock rows showing that account's
// switches. Every read is stamped with the generation it
// started in and a session flip bumps the generation, so an
// answer that lands after a sign-out is dropped. The flip is
// handled in the render phase (compare-with-previous), so no
// frame ever paints unlocked rows across a session change.
//
// Used by:
//   - SettingsScreen (below) — channelsLocked, the retry row
//     and pull-to-refresh
// -----------------------------------------------------------

function useChannelsSync(isAuthenticated: boolean): {
  loaded: boolean;
  failed: boolean;
  read: () => Promise<void>;
} {

  const { syncState } = useStoreValue(notifyEngine.prefs);
  const [latch, setLatch] = useState<ChannelsLatch>({
    session: isAuthenticated,
    generation: 0,
    loaded: false,
  });


  // A session flip — either direction — starts locked again
  // and moves the generation on, so a read still in flight for
  // the old session can never unlock the new one
  if (latch.session !== isAuthenticated) {
    setLatch({ session: isAuthenticated, generation: latch.generation + 1, loaded: false });
  }


  // Server truth, read behind the engine's readiness: the
  // legacy master-switch migration has to land before this
  // read snapshots the master key, or a user who opted out in
  // the old version sees the switch ON. refreshPrefs never
  // rejects — a failed GET lands as syncState 'error', and a
  // read that errored leaves the rows locked. A promise chain
  // rather than async/await: the latch closes inside the
  // continuation, so the effect below calls no setState itself
  const generation = latch.generation;
  const read = useCallback(
    () =>
      readyNotifyEngine()
        .then(() => notifyEngine.refreshPrefs())
        .then(() => {
          if (notifyEngine.prefs.get().syncState === 'error') return;
          setLatch((previous) =>
            previous.generation === generation && !previous.loaded ? { ...previous, loaded: true } : previous,
          );
        }),
    [generation],
  );


  // Channel switches are account state — read them once per
  // session. `read` changes identity exactly when the
  // generation does, so this fires once per sign-in, never on
  // the latch closing
  useEffect(() => {
    if (!isAuthenticated) return;
    void read();
  }, [isAuthenticated, read]);


  const loaded = latch.session === isAuthenticated && latch.loaded;
  return { loaded, failed: isAuthenticated && !loaded && syncState === 'error', read };
}







// -----------------------------------------------------------
// SettingsScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — the settings tab of (main)/tabs
// -----------------------------------------------------------

export default function SettingsScreen() {

  const { theme, language, setTheme, setLanguage, resetSettings } = useApp();
  const { isAuthenticated, user, logout, loggingOut } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const channels = useChannelsSync(isAuthenticated);


  // The kit paints from tokens, not classNames — hand it the
  // active palette so the rows follow the theme like the rest
  const kitColors: NotifyColors = {
    ink: colors.ink,
    inkSoft: colors.inkSoft,
    line: colors.line,
    brand: colors.brand,
    surface: colors.surface,
  };

  const gateLabels: PermissionGateLabels = {
    promptTitle: t('settings.pushPromptTitle'),
    promptBody: t('settings.pushPromptBody'),
    promptButton: t('settings.pushPromptButton'),
    blockedTitle: t('settings.pushBlockedTitle'),
    blockedBody: t('settings.pushBlockedBody'),
    blockedButton: t('settings.pushBlockedButton'),
    unsupportedBody: t('settings.pushUnsupported'),
  };

  const panelLabels: NotifySettingsLabels = {
    master: t('settings.pushNotifications'),
    masterHint: t('settings.pushNotificationsDesc'),
    channels: {
      news: t('settings.channelNews'),
      chat: t('settings.channelChat'),
      schedule: t('settings.channelSchedule'),
      admin: t('settings.channelAdmin'),
    },
    chatPreview: t('settings.chatPreview'),
    // Privacy, not a subscription: with this off the push says
    // only "Nauja žinutė" and the message text never leaves
    chatPreviewHint: t('settings.chatPreviewDesc'),
  };

  const channelHints = {
    news: t('settings.channelNewsDesc'),
    chat: t('settings.channelChatDesc'),
    schedule: t('settings.channelScheduleDesc'),
    admin: t('settings.channelAdminDesc'),
  };

  const panelIcons: NotifySettingsIcons = {
    master: <Ionicons name="notifications-outline" size={20} color={colors.inkSoft} />,
    news: <Ionicons name="newspaper-outline" size={20} color={colors.inkSoft} />,
    chat: <Ionicons name="chatbubble-outline" size={20} color={colors.inkSoft} />,
    schedule: <Ionicons name="calendar-outline" size={20} color={colors.inkSoft} />,
    admin: <Ionicons name="megaphone-outline" size={20} color={colors.inkSoft} />,
    chatPreview: <Ionicons name="eye-off-outline" size={20} color={colors.inkSoft} />,
  };


  // Delivery is impossible for a reason the engine reported —
  // the switch already snapped back, this is the explanation
  const toastBlocked = (reason: BlockedReason) =>
    showToast('error', t(reason === 'unsupported' ? 'settings.pushUnsupported' : 'settings.pushPermissionDenied'));


  // The engine the kit and the reset talk to is a FACADE over
  // the real one: the kit is structural and owns no strings, so
  // the toasts the engine cannot speak are added here, on the
  // two calls whose failures the panel keeps quiet about. A
  // master-ON that failed on the wire → toast.networkError with
  // the switch left ON (the intent is stored; the next register
  // re-asserts it) — never for 'unauthenticated', a guest
  // recording the intent is exactly right, and never for the
  // reasons the panel hands back through onBlocked. A chat-
  // preview save the engine reverted → channelUpdateError,
  // because the row merely snaps back. Everything else forwards
  // untouched, and the stores are the same objects, so the
  // kit's subscriptions still watch the real engine
  const panelEngine = useMemo(
    () => ({
      ...notifyEngine,
      setMasterEnabled: async (on: boolean) => {
        const result = await notifyEngine.setMasterEnabled(on);
        if (on && result && !result.ok && result.reason === 'network') {
          showToast('error', t('toast.networkError'));
        }
        return result;
      },
      setChatPreview: async (on: boolean) => {
        if (!(await notifyEngine.setChatPreview(on))) {
          showToast('error', t('settings.channelUpdateError'));
        }
      },
    }),
    [t],
  );


  // Alert.alert is a no-op on web — confirmAction covers both.
  // AuthContext's own `loggingOut` flag drives the guard and the
  // button's spinner/disabled state, so a second tap during the
  // teardown is a no-op wherever the logout was started.
  const handleLogout = async () => {
    if (loggingOut) return;
    const confirmed = await confirmAction({
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      confirmLabel: t('settings.logout'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;
    await logout();
  };


  // Device-local defaults only (tab bar included); AppContext
  // re-syncs i18n when the language snaps back to Lithuanian.
  // Defaults mean push ON, so the reset re-enables the engine's
  // master switch through the facade — which registers, or for
  // a guest records the intent and never touches the wire — and
  // snaps it back OFF with the reason when the OS denies or the
  // platform has no push, exactly as the panel's own toggle
  // would. No account guard here: the engine's gate is the one
  // truth about who may register
  const handleReset = async () => {
    const confirmed = await confirmAction({
      title: t('settings.resetDefaults'),
      message: `${t('settings.resetConfirm')} ${t('settings.resetConfirmTabs')}`,
      confirmLabel: t('settings.reset'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    resetSettings();
    showToast('success', t('settings.resetDone'));

    if (notifyEngine.prefs.get().masterEnabled) return;
    const result = await panelEngine.setMasterEnabled(true);
    if (result && !result.ok && (result.reason === 'permission' || result.reason === 'unsupported')) {
      await panelEngine.setMasterEnabled(false);
      toastBlocked(result.reason);
    }
  };


  // Pull-to-refresh re-reads the backend switches; for guests
  // there is no server state, so the pull just retracts. A read
  // that fails is a failed READ, so it gets the generic toast,
  // never the failed-save one
  const handleRefresh = async () => {
    if (!isAuthenticated) return;
    setRefreshing(true);
    try {
      await channels.read();
      if (notifyEngine.prefs.get().syncState === 'error') {
        showToast('error', t('toast.genericError'));
      }
    } finally {
      setRefreshing(false);
    }
  };


  // The engine reverts a failed channel save by itself but
  // says nothing — the row would just snap back. A failed save
  // is the ONE transition that passes through 'flushing' (a
  // failed read never does), so that edge carries the toast
  useEffect(() => {
    let previous = notifyEngine.prefs.get().syncState;
    return notifyEngine.prefs.subscribe(({ syncState }) => {
      if (previous === 'flushing' && syncState === 'error') {
        showToast('error', t('settings.channelUpdateError'));
      }
      previous = syncState;
    });
  }, [t]);


  const isAdminOrCurator =
    isAuthenticated && (user?.role === 'admin' || user?.role === 'curator');


  return (
    <Screen>
      <Header title={t('settings.title')} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-md pb-xl"
        refreshControl={
          <RefreshSpinner
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >

        {/* Account — the signed-in card or the guest prompt */}
        <View className="mb-sm">
          <SectionTitle>{t('settings.account')}</SectionTitle>
        </View>
        {isAuthenticated && user ? (
          <UserCard user={user} loggingOut={loggingOut} onLogout={handleLogout} />
        ) : (
          <GuestCard />
        )}

        {/* Preferences — theme and language */}
        <View className="mb-sm mt-lg">
          <SectionTitle>{t('settings.preferences')}</SectionTitle>
        </View>
        <Card padding="none">
          {/* Theme is three-way, so the control gets its own line */}
          <View className="border-b border-line px-md py-md">
            <View className="mb-sm flex-row items-center gap-sm">
              <Ionicons name="color-palette-outline" size={20} color={colors.brand} />
              <Text className="flex-1 font-raleway-medium text-base text-ink">
                {t('settings.theme')}
              </Text>
            </View>
            <SegmentedControl
              options={[
                { value: 'light', label: t('settings.light') },
                { value: 'dark', label: t('settings.dark') },
                { value: 'system', label: t('settings.system') },
              ]}
              value={theme}
              onChange={setTheme}
              fullWidth
            />
          </View>

          <View className="flex-row items-center gap-sm px-md py-md">
            <Ionicons name="language-outline" size={20} color={colors.brand} />
            <Text className="flex-1 font-raleway-medium text-base text-ink">
              {t('settings.language')}
            </Text>
            {/* LT / EN are locale codes, identical in both
                languages; screen readers get the full names.
                The engine host re-registers the token in the
                new language — nothing to do here */}
            <SegmentedControl
              options={[
                { value: 'lt', label: 'LT', a11yLabel: 'Lietuvių' },
                { value: 'en', label: 'EN', a11yLabel: 'English' },
              ]}
              value={language}
              onChange={setLanguage}
            />
          </View>
        </Card>

        {/* Notifications — the gate decides whether push can be
            delivered at all; inside it the panel shows the
            master switch for everyone and the server-truth rows
            for an account, locked until the first read lands.
            The gate wraps the Card (not the reverse) so its own
            prompt card never sits boxed inside ours. */}
        <View className="mb-sm mt-lg">
          <SectionTitle>{t('settings.notifications')}</SectionTitle>
        </View>
        <PermissionGate
          engine={panelEngine}
          labels={gateLabels}
          onOpenSettings={() => Linking.openSettings()}
          colors={kitColors}
        >
          <Card padding="none">
            {channels.failed ? <ChannelsRetryRow onRetry={() => void channels.read()} /> : null}
            <View className="px-md">
              <NotifySettingsPanel
                engine={panelEngine}
                labels={panelLabels}
                colors={kitColors}
                showChannels={isAuthenticated}
                channelsLocked={isAuthenticated && !channels.loaded}
                channelHints={channelHints}
                icons={panelIcons}
                onBlocked={toastBlocked}
              />
            </View>
          </Card>
        </PermissionGate>

        {/* Links — faculty info for everyone, admin by role, and
            the account-deletion path for anyone signed in */}
        <View className="mb-sm mt-lg">
          <SectionTitle>{t('settings.other')}</SectionTitle>
        </View>
        <Card padding="none">
          <LinkRow
            icon="information-circle-outline"
            label={t('info.title')}
            onPress={() => router.push('/(main)/info')}
            divider={isAdminOrCurator || isAuthenticated}
          />
          {isAdminOrCurator && (
            <LinkRow
              icon="shield-checkmark-outline"
              label={t('admin.title')}
              onPress={() => router.push('/(main)/admin')}
              divider={isAuthenticated}
            />
          )}
          {isAuthenticated && (
            <LinkRow
              icon="trash-outline"
              label={t('settings.deleteAccount')}
              onPress={() => router.push('/(main)/delete-account')}
            />
          )}
        </Card>

        <View className="mt-lg">
          <Button
            title={t('settings.resetDefaults')}
            variant="outline"
            onPress={handleReset}
          />
        </View>

        {/* The resolved backend address — a misconfigured build
            (e.g. EXPO_PUBLIC_API_URL unset) is otherwise
            indistinguishable from being offline */}
        <Text className="mt-md text-center font-raleway text-xs text-ink-faint">
          {t('settings.serverAddress', { url: API_BASE_URL })}
        </Text>
      </ScrollView>
    </Screen>
  );
}
