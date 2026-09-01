// -----------------------------------------------------------
//  [*] Admin — invitation codes and usage stats
//
//  The admin dashboard, reached from the settings screen.
//  Admins and curators manage invitation codes here; the
//  stats tiles and the manage-users link are admin-only —
//  /admin/stats answers 403 for curators, so the screen only
//  asks for what the role can get. Any other role (or a
//  logged-out visitor) gets the no-access EmptyState and NO
//  api calls are fired — the old screen 403'd twice and
//  toasted an error over that very screen.
//
//  Each active code opens a QR modal encoding
//  knfapp://register?code=… for a student to scan;
//  app/register.tsx reads the ?code param and applies it once
//  per value, so scanning lands on registration with the code
//  field already seeded.
//
//  The QR plate is pinned to the LIGHT palette in both
//  schemes on purpose — scanners want dark-on-light, and an
//  inverted dark-mode QR often fails to read.
//
//  Split into (root component last):
//
//    adminErrorKey        — failure → catalog-key map
//    Chip                 — selectable pill for the form pickers
//    StatCard             — one dashboard counter tile
//    CreateInvitationForm — role / uses / expiry pickers
//    DashboardHeader      — stats, manage-users link, create form
//    InvitationCard       — one code row: copy / QR / revoke
//    QrModal              — the scannable invitation hand-off
//    AdminScreen          — data, gates, actions (default export)
// -----------------------------------------------------------

// UI kit — cards, buttons, the three data states, confirms
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  RefreshSpinner,
  Screen,
  SectionTitle,
  confirmAction,
} from '@/components/ui';

// Light palette for the scheme-pinned QR plate
import { palettes } from '@/constants/theme';

// Shared role → label map (falls back to the raw role name)
import { roleLabel } from '@/constants/roles';

// Session role gate
import { useAuth } from '@/context/AuthContext';

// Non-blocking feedback
import { showToast } from '@/context/NetworkContext';

// Refetch when connectivity returns
import { useNetworkRestore } from '@knf/dataengine';

// JS-side colors — icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Admin endpoints, their row shapes and the error type the
// catch sites branch on
import {
  ApiError,
  createInvitation,
  fetchAdminInvitations,
  fetchAdminStats,
  revokeInvitation,
  type AdminInvitation,
  type AdminStats,
} from '@/services/api';

// Expiry lines in the active language
import { formatDateTime } from '@/services/format';

// Icons, clipboard, navigation, list and modal primitives
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';


// The roles an invitation can mint, in picker order
const ROLE_OPTIONS = ['student', 'teacher', 'curator', 'admin'] as const;

// Use-count choices for the max-uses picker
const MAX_USES_OPTIONS = [1, 5, 10, 25, 100];

// Expiry choices in hours; labels come from the shared
// duration keys so "1d" reads "1 d." in Lithuanian
const EXPIRY_HOURS_OPTIONS = [1, 24, 72, 168, 720];

// What a create submission carries — snake_case matches the
// backend contract in services/api/admin.ts
interface CreateParams {
  role: string;
  max_uses: number;
  expires_hours: number;
}







// -----------------------------------------------------------
// adminErrorKey
// -----------------------------------------------------------
//
// Maps a failed admin call onto a catalog key: the api
// layer's timeout/network sentinels translate globally, a 403
// gets the permissions line, anything else falls back to the
// action's own error key. 404 is branched at the call sites —
// it also drops the stale row.
//
// Used by:
//   - AdminScreen (below) — load / create / revoke catches
// -----------------------------------------------------------

const adminErrorKey = (err: unknown, fallbackKey: string): string => {
  if (err instanceof ApiError && err.code === 'timeout') return 'toast.timeout';
  if (err instanceof ApiError && err.code === 'network') return 'toast.networkError';
  if (err instanceof ApiError && err.status === 403) return 'admin.noPermission';
  return fallbackKey;
};







// -----------------------------------------------------------
// Chip
// -----------------------------------------------------------
//
// One selectable pill of the create-form pickers; selected
// fills brand, idle sits on surface-soft. hitSlop restores
// the 44pt target around the compact pill.
//
// Used by:
//   - CreateInvitationForm (below)
// -----------------------------------------------------------

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      className={
        selected ? 'rounded-full bg-brand px-md py-sm' : 'rounded-full bg-surface-soft px-md py-sm'
      }
    >
      <Text
        className={
          selected
            ? 'font-raleway-medium text-sm text-on-brand'
            : 'font-raleway text-sm text-ink'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// StatCard
// -----------------------------------------------------------
//
// Used by:
//   - DashboardHeader (below) — the four counter tiles
// -----------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {

  const { colors } = useTheme();


  return (
    <Card className="min-w-[45%] flex-1">
      <View className="flex-row items-center gap-sm">
        <Ionicons name={icon} size={18} color={colors.brand} />
        <Text className="font-raleway-bold text-2xl text-ink">{value}</Text>
      </View>
      <Text className="mt-xs font-raleway text-xs text-ink-soft">{label}</Text>
    </Card>
  );
}







// -----------------------------------------------------------
// CreateInvitationForm
// -----------------------------------------------------------
//
// The three chip pickers plus the generate button. Picker
// state lives here — closing the form resets it to the
// defaults, which is what a fresh code usually wants.
//
// Used by:
//   - DashboardHeader (below) — mounted while the form is open
// -----------------------------------------------------------

function CreateInvitationForm({
  isAdmin,
  creating,
  onCreate,
}: {
  isAdmin: boolean;
  creating: boolean;
  onCreate: (params: CreateParams) => void;
}) {

  const { t } = useTranslation();
  const [role, setRole] = useState<string>('student');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresHours, setExpiresHours] = useState(24);


  // Curators can only mint student/teacher codes — the backend
  // 403s the rest, so the picker never offers them; the
  // 'student' default is valid for both role sets
  const roleOptions = isAdmin ? ROLE_OPTIONS : (['student', 'teacher'] as const);


  // Admin/curator codes are credentials, not flyers: the
  // backend rejects anything but single-use and ≤72 h for them,
  // so the pickers offer only what will mint, and switching to
  // such a role snaps the current picks into range
  const privileged = role === 'admin' || role === 'curator';
  const usesOptions = privileged ? [1] : MAX_USES_OPTIONS;
  const expiryOptions = privileged
    ? EXPIRY_HOURS_OPTIONS.filter((hours) => hours <= 72)
    : EXPIRY_HOURS_OPTIONS;

  const selectRole = (next: string) => {
    setRole(next);
    if (next === 'admin' || next === 'curator') {
      setMaxUses(1);
      setExpiresHours((current) => Math.min(current, 72));
    }
  };


  // Sub-day choices read as hours, the rest as days — via the
  // shared duration keys so both languages are covered
  const expiryLabel = (hours: number): string =>
    hours < 24
      ? t('network.hoursShort', { count: hours })
      : t('network.daysShort', { count: hours / 24 });


  return (
    <Card className="mt-sm">

      <Text className="mb-sm font-raleway-medium text-sm text-ink-soft">{t('admin.role')}</Text>
      <View className="mb-md flex-row flex-wrap gap-sm">
        {roleOptions.map((option) => (
          <Chip
            key={option}
            label={roleLabel(t, option)}
            selected={role === option}
            onPress={() => selectRole(option)}
          />
        ))}
      </View>
      {privileged && (
        <Text className="-mt-sm mb-md font-raleway text-xs text-ink-faint">
          {t('admin.privilegedCodeHint')}
        </Text>
      )}

      <Text className="mb-sm font-raleway-medium text-sm text-ink-soft">{t('admin.maxUses')}</Text>
      <View className="mb-md flex-row flex-wrap gap-sm">
        {usesOptions.map((option) => (
          <Chip
            key={option}
            label={String(option)}
            selected={maxUses === option}
            onPress={() => setMaxUses(option)}
          />
        ))}
      </View>

      <Text className="mb-sm font-raleway-medium text-sm text-ink-soft">{t('admin.expires')}</Text>
      <View className="mb-md flex-row flex-wrap gap-sm">
        {expiryOptions.map((option) => (
          <Chip
            key={option}
            label={expiryLabel(option)}
            selected={expiresHours === option}
            onPress={() => setExpiresHours(option)}
          />
        ))}
      </View>

      <Button
        title={t('admin.generate')}
        loading={creating}
        onPress={() => onCreate({ role, max_uses: maxUses, expires_hours: expiresHours })}
      />

    </Card>
  );
}







// -----------------------------------------------------------
// DashboardHeader
// -----------------------------------------------------------
//
// Everything above the code list: the stat tiles (admin only —
// null while curators browse), the manage-users link, the
// create toggle with its form, and the list's section title.
//
// Used by:
//   - AdminScreen (below) — FlatList ListHeaderComponent
// -----------------------------------------------------------

function DashboardHeader({
  stats,
  isAdmin,
  showForm,
  creating,
  onToggleForm,
  onCreate,
  onManageUsers,
}: {
  stats: AdminStats | null;
  isAdmin: boolean;
  showForm: boolean;
  creating: boolean;
  onToggleForm: () => void;
  onCreate: (params: CreateParams) => void;
  onManageUsers: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="px-md pt-md">

      {stats && (
        <View className="flex-row flex-wrap gap-sm">
          <StatCard icon="people" label={t('admin.users')} value={stats.users} />
          <StatCard icon="newspaper" label={t('admin.posts')} value={stats.posts} />
          <StatCard icon="globe" label={t('admin.articles')} value={stats.scrapedArticles} />
          <StatCard icon="ticket" label={t('admin.invites')} value={stats.activeInvitations} />
        </View>
      )}

      {isAdmin && (
        <Card onPress={onManageUsers} className="mt-md">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-sm">
              <Ionicons name="people" size={20} color={colors.brand} />
              <Text className="font-raleway-bold text-base text-ink">{t('admin.manageUsers')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </View>
        </Card>
      )}

      <View className="mt-md">
        <Button
          title={showForm ? t('common.cancel') : t('admin.createInvitation')}
          leftIcon={showForm ? 'close' : 'add'}
          onPress={onToggleForm}
        />
      </View>

      {showForm && <CreateInvitationForm isAdmin={isAdmin} creating={creating} onCreate={onCreate} />}

      <View className="mb-sm mt-lg">
        <SectionTitle>{t('admin.activeCodes')}</SectionTitle>
      </View>

    </View>
  );
}







// -----------------------------------------------------------
// InvitationCard
// -----------------------------------------------------------
//
// One invitation row: the mono code doubles as the copy
// target, a spent code (expired or fully used) dims and gains
// a status pill. QR and copy are offered only on codes the
// viewer could mint themselves (defense in depth behind the
// backend's list scoping); revoking is admin-only.
//
// Memoized with item-taking handlers — header churn (form
// toggle, refresh, stats landing) re-renders the screen, and
// unchanged rows must not re-render with it.
//
// Used by:
//   - AdminScreen (below) — FlatList renderItem
// -----------------------------------------------------------

const InvitationCard = memo(function InvitationCard({
  item,
  isAdmin,
  onCopy,
  onShowQr,
  onRevoke,
}: {
  item: AdminInvitation;
  isAdmin: boolean;
  onCopy: (code: string) => void;
  onShowQr: (item: AdminInvitation) => void;
  onRevoke: (item: AdminInvitation) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const spent = item.expired || item.fullyUsed;


  // Non-admin viewers never hand out codes for roles they
  // cannot mint — the list is filtered upstream, this guards
  // the actions should a row ever slip through
  const shareable = isAdmin || item.role === 'student' || item.role === 'teacher';


  return (
    <Card className="mx-md mb-sm">

      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => onCopy(item.code)}
          disabled={!shareable}
          hitSlop={{ top: 10, bottom: 10 }}
          accessibilityRole="button"
          // Spelled out character by character ahead of the
          // action — a bare "Copy" would hide WHAT gets copied
          accessibilityLabel={`${item.code.split('').join(' ')}, ${t('common.copy')}`}
          className="flex-1 flex-row items-center gap-sm"
        >
          <Text className={spent ? 'font-mono text-lg text-ink-faint' : 'font-mono text-lg text-brand-text'}>
            {item.code}
          </Text>
          {shareable && (
            <Ionicons name="copy-outline" size={16} color={spent ? colors.inkFaint : colors.brand} />
          )}
        </Pressable>

        <View className="flex-row items-center gap-md">
          {!spent && shareable && (
            <Pressable
              onPress={() => onShowQr(item)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('admin.showQr')}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.brand} />
            </Pressable>
          )}
          {!spent && isAdmin && (
            <Pressable
              onPress={() => onRevoke(item)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('admin.revoke')}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          )}
        </View>
      </View>

      <View className="mt-sm flex-row flex-wrap items-center gap-md">
        <View className="flex-row items-center gap-xs">
          <Ionicons name="person" size={14} color={colors.inkSoft} />
          <Text className="font-raleway text-xs text-ink-soft">{roleLabel(t, item.role)}</Text>
        </View>
        <View className="flex-row items-center gap-xs">
          <Ionicons name="repeat" size={14} color={colors.inkSoft} />
          <Text className="font-raleway text-xs text-ink-soft">
            {item.useCount}/{item.maxUses}
          </Text>
        </View>
        <View className="flex-row items-center gap-xs">
          <Ionicons name="time" size={14} color={colors.inkSoft} />
          <Text className="font-raleway text-xs text-ink-soft">{formatDateTime(item.expiresAt)}</Text>
        </View>
      </View>

      {spent && (
        <View className="mt-sm self-start rounded-md bg-danger-soft px-sm py-xs">
          <Text className="font-raleway-medium text-xs text-danger">
            {item.fullyUsed ? t('admin.fullyUsed') : t('admin.expired')}
          </Text>
        </View>
      )}

    </Card>
  );
});







// -----------------------------------------------------------
// QrModal
// -----------------------------------------------------------
//
// The scannable hand-off for one invitation. The QR sits on a
// plate pinned to the LIGHT palette in both schemes (see the
// file header) so it always scans. Backdrop tap, the close
// button and the hardware back all dismiss.
//
// Used by:
//   - AdminScreen (below) — mounted once, fed by qrInvitation
// -----------------------------------------------------------

function QrModal({
  invitation,
  onCopy,
  onClose,
}: {
  invitation: AdminInvitation | null;
  onCopy: (code: string) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();


  return (
    <Modal
      visible={!!invitation}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center px-lg">

        <Pressable
          className="absolute inset-0 bg-scrim"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('admin.qrClose')}
        />

        {invitation && (
          <View className="w-full max-w-[360px] items-center rounded-2xl bg-surface p-lg">

            <Text className="font-raleway-bold text-lg text-ink">{t('admin.qrTitle')}</Text>
            <Text className="mb-lg mt-xs text-center font-raleway text-sm text-ink-soft">
              {t('admin.qrHint')}
            </Text>

            {/* Scheme-pinned plate — dark-on-light scans, inverted often doesn't */}
            <View className="rounded-xl p-md" style={{ backgroundColor: palettes.light.surface }}>
              <QRCode
                value={`knfapp://register?code=${invitation.code}`}
                size={200}
                color={palettes.light.brand}
                backgroundColor={palettes.light.surface}
              />
            </View>

            <Text className="mt-md font-mono text-lg text-brand-text">{invitation.code}</Text>

            <View className="mt-sm flex-row items-center gap-sm">
              <View className="rounded-full bg-surface-soft px-md py-xs">
                <Text className="font-raleway text-xs text-ink-soft">{roleLabel(t, invitation.role)}</Text>
              </View>
              <View className="rounded-full bg-surface-soft px-md py-xs">
                <Text className="font-raleway text-xs text-ink-soft">
                  {invitation.useCount}/{invitation.maxUses}
                </Text>
              </View>
            </View>

            <View className="mt-lg flex-row gap-sm">
              <Button
                title={t('common.copy')}
                variant="secondary"
                fullWidth={false}
                leftIcon="copy-outline"
                onPress={() => onCopy(invitation.code)}
              />
              <Button title={t('admin.qrClose')} fullWidth={false} onPress={onClose} />
            </View>

          </View>
        )}

      </View>
    </Modal>
  );
}







// -----------------------------------------------------------
// AdminScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /admin
//   - app/(main)/tabs/settings.tsx — the admin panel link
// -----------------------------------------------------------

export default function AdminScreen() {

  const { t } = useTranslation();
  const { user, hydrated } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();


  // Curators manage codes; only admins see stats, the user
  // list and the revoke action
  const isAdmin = user?.role === 'admin';
  const canView = isAdmin || user?.role === 'curator';


  const [invitations, setInvitations] = useState<AdminInvitation[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(canView);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [qrInvitation, setQrInvitation] = useState<AdminInvitation | null>(null);


  // Mirror for async failure semantics: a failed refresh
  // behind shown data toasts, a failed first load errors
  const hasData = useRef(false);


  // Only the newest request may write — a slow response from
  // before a refresh, retry or restore is dropped
  const seqRef = useRef(0);


  // One code path for first load, retry, refresh and restore;
  // stats failures never take the invitation list down
  const load = async (showSpinner: boolean): Promise<void> => {
    const seq = ++seqRef.current;
    if (showSpinner) {
      setLoading(true);
      setFailed(false);
    }

    try {
      const { invitations: list } = await fetchAdminInvitations();
      if (seq !== seqRef.current) return;
      setInvitations(list);
      hasData.current = true;
      setFailed(false);
    } catch (err) {
      if (seq !== seqRef.current) return;
      if (hasData.current) showToast('error', t(adminErrorKey(err, 'admin.loadError')));
      else setFailed(true);
    }

    if (isAdmin) {
      try {
        const nextStats = await fetchAdminStats();
        if (seq !== seqRef.current) return;
        setStats(nextStats);
      } catch {
        // Tiles simply stay hidden; codes still work
      }
    }

    if (seq !== seqRef.current) return;
    if (showSpinner) setLoading(false);
  };


  // Data loading is gated on the role — no 403 calls (and no
  // error toast) ever fire over the no-access screen
  useEffect(() => {
    if (canView) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);


  // Back online: silent refetch behind shown data, full
  // spinner over nothing
  useNetworkRestore(() => {
    if (canView) void load(!hasData.current);
  });


  const onRefresh = () => {
    setRefreshing(true);
    void load(false).finally(() => setRefreshing(false));
  };


  const handleCreate = async (params: CreateParams): Promise<void> => {
    setCreating(true);

    try {
      const created = await createInvitation(params);
      // The 201 body carries only the stored columns — a fresh
      // code is by definition just-created, unexpired and unused
      const row: AdminInvitation = {
        ...created,
        createdAt: new Date().toISOString(),
        expired: false,
        fullyUsed: false,
      };
      setInvitations((previous) => [row, ...(previous ?? [])]);
      setShowForm(false);
      showToast('success', t('admin.codeCreated', { code: created.code }));
    } catch (err) {
      showToast('error', t(adminErrorKey(err, 'admin.createError')));
    } finally {
      setCreating(false);
    }
  };


  // Cancel is 'Grįžti'-style common.back — the LT verb
  // "Atšaukti" would otherwise open BOTH buttons of a
  // destructive confirm
  const handleRevoke = useCallback(
    async (invitation: AdminInvitation): Promise<void> => {
      const confirmed = await confirmAction({
        title: t('admin.revokeTitle'),
        message: t('admin.revokeConfirm'),
        confirmLabel: t('admin.revoke'),
        cancelLabel: t('common.back'),
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await revokeInvitation(invitation.id);
        setInvitations((previous) => (previous ?? []).filter((i) => i.id !== invitation.id));
        showToast('success', t('admin.codeRevoked'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Revoked elsewhere already — drop the stale row
          setInvitations((previous) => (previous ?? []).filter((i) => i.id !== invitation.id));
          showToast('info', t('admin.codeGone'));
        } else {
          showToast('error', t(adminErrorKey(err, 'admin.revokeError')));
        }
      }
    },
    [t],
  );


  // Toast only after the clipboard actually took the code —
  // and say so when it did not
  const handleCopy = useCallback(
    (code: string) => {
      Clipboard.setStringAsync(code)
        .then(() => showToast('success', t('admin.codeCopied')))
        .catch(() => showToast('error', t('toast.genericError')));
    },
    [t],
  );


  // Stable per-row callbacks so the memoized cards only
  // re-render when their own invitation changes
  const handleShowQr = useCallback((item: AdminInvitation) => setQrInvitation(item), []);

  const handleRevokeRow = useCallback(
    (item: AdminInvitation) => void handleRevoke(item),
    [handleRevoke],
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminInvitation }) => (
      <InvitationCard
        item={item}
        isAdmin={isAdmin}
        onCopy={handleCopy}
        onShowQr={handleShowQr}
        onRevoke={handleRevokeRow}
      />
    ),
    [isAdmin, handleCopy, handleShowQr, handleRevokeRow],
  );


  // The QR modal sits over everything — close it before the
  // copy toast so the confirmation is not hidden behind it
  const handleQrCopy = useCallback(
    (code: string) => {
      setQrInvitation(null);
      handleCopy(code);
    },
    [handleCopy],
  );


  // Client-side mirror of the backend's list scoping (defense
  // in depth): a non-admin viewer never sees codes for roles
  // they cannot mint, even if a response slips them through
  const visibleInvitations = useMemo(() => {
    const list = invitations ?? [];
    return isAdmin ? list : list.filter((i) => i.role === 'student' || i.role === 'teacher');
  }, [invitations, isAdmin]);


  // Session restore is still reading storage — judging the
  // role now would flash the no-access screen at admins
  if (!hydrated) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (!canView) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title={t('admin.noAccess')} />
      </Screen>
    );
  }


  // The null-invitations check also covers the first frame
  // after hydration, before the load effect has committed
  if (loading || (invitations === null && !failed)) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (failed && invitations === null) {
    return (
      <Screen>
        <ErrorState message={t('admin.loadError')} onRetry={() => void load(true)} />
      </Screen>
    );
  }


  return (
    <Screen>

      <FlatList
        data={visibleInvitations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshSpinner
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        // The last card must clear the home indicator — this
        // pushed screen has no tab bar below it
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <DashboardHeader
            stats={stats}
            isAdmin={isAdmin}
            showForm={showForm}
            creating={creating}
            onToggleForm={() => setShowForm((open) => !open)}
            onCreate={(params) => void handleCreate(params)}
            onManageUsers={() => router.push('/admin-users')}
          />
        }
        ListEmptyComponent={<EmptyState icon="ticket-outline" title={t('admin.noCodes')} />}
      />

      <QrModal
        invitation={qrInvitation}
        onCopy={handleQrCopy}
        onClose={() => setQrInvitation(null)}
      />

    </Screen>
  );
}
