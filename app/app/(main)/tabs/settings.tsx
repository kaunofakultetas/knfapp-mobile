// -----------------------------------------------------------
//  [*] Tabs — Settings
//
//  Device-local preferences plus the account section. The
//  whole screen works logged out: guests get every preference
//  and a friendly login card; an account adds the logout
//  button, the backend notification-channel switches and the
//  admin link (admin/curator roles only).
//
//  Channel switches are optimistic and debounced: every flip
//  lands in a pending ref and ONE merged request goes out
//  after the flush delay, so two different switches flipped
//  back to back both reach the backend (the old per-channel
//  payload dropped the first one). A failed save reverts only
//  the channels of the failed batch and toasts; a batch still
//  pending on unmount is flushed as a fire-and-forget request.
//
//  The push master switch awaits the token registration and
//  snaps back OFF with a toast when the OS denies permission
//  (or the platform has no push at all). Turning it off calls
//  the unregister helper, which no-ops unless a token was
//  actually registered this session.
//
//  Reset restores device-local defaults only — the backend
//  channel switches are account state and stay. The language
//  re-sync after reset happens inside AppContext (its i18n
//  effect follows the language setting), not here.
//
//  Split into (root component last):
//
//    DEFAULT_CHANNELS — switch state before the backend answers
//    CHANNEL_META     — per-channel icon + i18n keys
//    SegmentedControl — theme / language option pills
//    SwitchRow        — icon + label + themed Switch row
//    LinkRow          — chevron navigation row
//    UserCard         — avatar + identity + logout
//    GuestCard        — login prompt for guests
//    SettingsScreen   — the tab itself (default export)
// -----------------------------------------------------------

// Device-local settings and the session
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// Backend channel switches and push token plumbing
import {
  fetchNotificationChannels,
  updateNotificationChannels,
  type NotificationChannel,
} from '@/services/api';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/services/notifications';

// UI kit and JS-side colors
import {
  Avatar,
  Button,
  Card,
  confirmAction,
  Header,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Icons, navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';

// The session user shown on the account card
import type { User } from '@/types';


// Everything on until the backend says otherwise — matches the
// backend's own default for a fresh account
const DEFAULT_CHANNELS: Record<NotificationChannel, boolean> = {
  news: true,
  chat: true,
  schedule: true,
  admin: true,
};

// Debounce window for merging rapid channel flips into one save
const CHANNEL_FLUSH_DELAY_MS = 300;

// One selectable pill of a SegmentedControl
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SwitchRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onToggle: (value: boolean) => void;
  divider?: boolean;
}

interface LinkRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  divider?: boolean;
}







// -----------------------------------------------------------
// CHANNEL_META
// -----------------------------------------------------------
//
// Display metadata for the four backend notification channels.
// The keys MUST match the api layer's NotificationChannel —
// the switch state and the save payloads are keyed by them.
//
// Used by:
//   - SettingsScreen (below) — the channel switch list
// -----------------------------------------------------------

const CHANNEL_META: {
  key: NotificationChannel;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  descKey: string;
}[] = [
  {
    key: 'news',
    icon: 'newspaper-outline',
    labelKey: 'settings.channelNews',
    descKey: 'settings.channelNewsDesc',
  },
  {
    key: 'chat',
    icon: 'chatbubble-outline',
    labelKey: 'settings.channelChat',
    descKey: 'settings.channelChatDesc',
  },
  {
    key: 'schedule',
    icon: 'calendar-outline',
    labelKey: 'settings.channelSchedule',
    descKey: 'settings.channelScheduleDesc',
  },
  {
    key: 'admin',
    icon: 'megaphone-outline',
    labelKey: 'settings.channelAdmin',
    descKey: 'settings.channelAdminDesc',
  },
];







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
              'h-9 items-center justify-center rounded-sm px-md',
              fullWidth ? 'flex-1' : '',
              selected ? 'bg-brand' : '',
            ].join(' ')}
            hitSlop={6}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
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
// SwitchRow
// -----------------------------------------------------------
//
// Icon + label (+ optional description) with a themed Switch:
// track brand-soft/line, thumb brand/surface, all from the
// active palette so the row reads correctly in dark mode.
//
// Used by:
//   - SettingsScreen (below) — the push master switch and the
//     four channel switches
// -----------------------------------------------------------

function SwitchRow({
  icon,
  label,
  description,
  value,
  disabled = false,
  onToggle,
  divider = false,
}: SwitchRowProps) {

  const { colors } = useTheme();


  return (
    <View
      className={
        divider
          ? 'flex-row items-center gap-sm border-b border-line px-md py-md'
          : 'flex-row items-center gap-sm px-md py-md'
      }
    >

      <Ionicons name={icon} size={20} color={colors.brand} />

      <View className="mr-sm flex-1">
        <Text className="font-raleway-medium text-base text-ink">{label}</Text>
        {description ? (
          <Text className="mt-xs font-raleway text-xs leading-4 text-ink-soft">
            {description}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.brandSoft }}
        thumbColor={value ? colors.brand : colors.surface}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
      />
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
// UserCard
// -----------------------------------------------------------
//
// The signed-in account card: avatar, display name and email
// with the logout button. Name + email read to assistive tech
// as one "logged in as …" element.
//
// Used by:
//   - SettingsScreen (below) — account section when signed in
// -----------------------------------------------------------

function UserCard({ user, onLogout }: { user: User; onLogout: () => void }) {

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
  const pathname = usePathname();


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
          router.push({ pathname: '/login', params: { returnTo: pathname } })
        }
      />
    </Card>
  );
}







// -----------------------------------------------------------
// SettingsScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — the settings tab of (main)/tabs
// -----------------------------------------------------------

export default function SettingsScreen() {

  const { theme, language, notifications, setTheme, setLanguage, setNotifications, resetSettings } = useApp();
  const { isAuthenticated, user, logout } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();


  // Optimistic switch state plus two refs the debounce needs:
  // the last server-confirmed map (the revert baseline) and
  // the pending flips not yet sent
  const [channels, setChannels] =
    useState<Record<NotificationChannel, boolean>>(DEFAULT_CHANNELS);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const confirmedRef = useRef<Record<NotificationChannel, boolean>>(DEFAULT_CHANNELS);
  const pendingRef = useRef<Partial<Record<NotificationChannel, boolean>>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);


  // Stable so the load effect can depend on it; server truth
  // wins over local state except for flips still pending
  const loadChannels = useCallback(async () => {
    const res = await fetchNotificationChannels();
    confirmedRef.current = res.channels;
    if (mounted.current) {
      setChannels({ ...res.channels, ...pendingRef.current });
      setChannelsLoaded(true);
    }
  }, []);


  // Send ONE merged request for everything toggled inside the
  // debounce window — a per-channel payload used to silently
  // drop the first flip when two switches changed back to back
  const flushChannels = () => {
    const batch = pendingRef.current;
    if (Object.keys(batch).length === 0) return;
    pendingRef.current = {};

    updateNotificationChannels(batch)
      .then((res) => {
        confirmedRef.current = res.channels;
        if (mounted.current) {
          setChannels({ ...res.channels, ...pendingRef.current });
        }
      })
      .catch(() => {
        if (!mounted.current) return;
        // Revert ONLY the failed batch — a flip that became
        // pending during the request keeps its optimistic value
        setChannels((prev) => {
          const next = { ...prev };
          (Object.keys(batch) as NotificationChannel[]).forEach((key) => {
            if (!(key in pendingRef.current)) next[key] = confirmedRef.current[key];
          });
          return next;
        });
        showToast('error', t('settings.channelUpdateError'));
      });
  };


  // Flip optimistically, record the pending value, restart the
  // debounce — the timer always flushes the MERGED batch
  const handleToggleChannel = (channel: NotificationChannel, value: boolean) => {
    setChannels((prev) => ({ ...prev, [channel]: value }));
    pendingRef.current[channel] = value;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushChannels, CHANNEL_FLUSH_DELAY_MS);
  };


  // Master switch: ON awaits token registration and snaps back
  // OFF when the OS denies permission (or the platform has no
  // push); guests only store the preference — login registers.
  // OFF unregisters, a no-op unless a token was registered.
  const handleToggleNotifications = async (value: boolean) => {
    setNotifications(value);

    if (!value) {
      await unregisterPushNotifications();
      return;
    }

    if (!isAuthenticated) return;

    const registered = await registerForPushNotifications();
    if (!registered) {
      setNotifications(false);
      showToast('error', t('settings.pushPermissionDenied'));
    }
  };


  // Alert.alert is a no-op on web — confirmAction covers both
  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      confirmLabel: t('settings.logout'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (confirmed) await logout();
  };


  // Device-local defaults only; AppContext re-syncs i18n when
  // the language setting snaps back to Lithuanian
  const handleReset = async () => {
    const confirmed = await confirmAction({
      title: t('settings.resetDefaults'),
      message: t('settings.resetConfirm'),
      confirmLabel: t('settings.reset'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    resetSettings();
    showToast('success', t('settings.resetDone'));
  };


  // Pull-to-refresh re-reads the backend switches; for guests
  // there is no server state, so the pull just retracts
  const handleRefresh = async () => {
    if (!isAuthenticated) return;
    setRefreshing(true);
    try {
      await loadChannels();
    } catch {
      showToast('error', t('toast.genericError'));
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };


  // Channel switches are account state — (re)load per session;
  // logged out, everything snaps back to the defaults
  useEffect(() => {
    if (!isAuthenticated) {
      pendingRef.current = {};
      confirmedRef.current = DEFAULT_CHANNELS;
      setChannels(DEFAULT_CHANNELS);
      setChannelsLoaded(false);
      return;
    }
    loadChannels().catch(() => {
      // Defaults stay usable — partial saves still work
      if (mounted.current) setChannelsLoaded(true);
    });
  }, [isAuthenticated, loadChannels]);


  // Flush-on-unmount: the merged pending batch must not die
  // with the screen; reverts are pointless by then, so the
  // request goes out fire-and-forget
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      const batch = pendingRef.current;
      pendingRef.current = {};
      if (Object.keys(batch).length > 0) {
        updateNotificationChannels(batch).catch(() => {});
      }
    };
  }, []);


  const isAdminOrCurator =
    isAuthenticated && (user?.role === 'admin' || user?.role === 'curator');


  return (
    <Screen>
      <Header title={t('settings.title')} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-md pb-xl"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        }
      >

        {/* Account — the signed-in card or the guest prompt */}
        <View className="mb-sm">
          <SectionTitle>{t('settings.account')}</SectionTitle>
        </View>
        {isAuthenticated && user ? (
          <UserCard user={user} onLogout={handleLogout} />
        ) : (
          <GuestCard />
        )}

        {/* Preferences — push master switch, theme, language */}
        <View className="mb-sm mt-lg">
          <SectionTitle>{t('settings.preferences')}</SectionTitle>
        </View>
        <Card padding="none">
          <SwitchRow
            icon="notifications-outline"
            label={t('settings.pushNotifications')}
            description={t('settings.pushNotificationsDesc')}
            value={notifications}
            onToggle={handleToggleNotifications}
            divider
          />

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
            {/* LT / EN are locale codes, identical in both languages */}
            <SegmentedControl
              options={[
                { value: 'lt', label: 'LT' },
                { value: 'en', label: 'EN' },
              ]}
              value={language}
              onChange={setLanguage}
            />
          </View>
        </Card>

        {/* Channel switches — account state, only meaningful
            while the master switch is on */}
        {isAuthenticated && notifications && (
          <>
            <View className="mb-sm mt-lg">
              <SectionTitle>{t('settings.notificationChannels')}</SectionTitle>
            </View>
            <Card padding="none">
              {CHANNEL_META.map((channel, index) => (
                <SwitchRow
                  key={channel.key}
                  icon={channel.icon}
                  label={t(channel.labelKey)}
                  description={t(channel.descKey)}
                  value={channels[channel.key]}
                  disabled={!channelsLoaded}
                  onToggle={(value) => handleToggleChannel(channel.key, value)}
                  divider={index < CHANNEL_META.length - 1}
                />
              ))}
            </Card>
          </>
        )}

        {/* Links — faculty info for everyone, admin by role */}
        <View className="mb-sm mt-lg">
          <SectionTitle>{t('settings.other')}</SectionTitle>
        </View>
        <Card padding="none">
          <LinkRow
            icon="information-circle-outline"
            label={t('info.title')}
            onPress={() => router.push('/(main)/info')}
            divider={isAdminOrCurator}
          />
          {isAdminOrCurator && (
            <LinkRow
              icon="shield-checkmark-outline"
              label={t('admin.title')}
              onPress={() => router.push('/(main)/admin')}
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
      </ScrollView>
    </Screen>
  );
}
