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
//  knfapp://register?code=… for a student to scan. Known gap,
//  documented not fixed here: app/register.tsx does not read
//  the ?code param yet, so scanning opens registration with
//  an empty code field.
//
//  The QR plate is pinned to the LIGHT palette in both
//  schemes on purpose — scanners want dark-on-light, and an
//  inverted dark-mode QR often fails to read.
//
//  Split into (root component last):
//
//    ROLE_LABEL_KEYS      — role → catalog-key map
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
  Screen,
  SectionTitle,
  confirmAction,
} from '@/components/ui';

// Light palette for the scheme-pinned QR plate
import { palettes } from '@/constants/theme';

// Session role gate
import { useAuth } from '@/context/AuthContext';

// Non-blocking feedback
import { showToast } from '@/context/NetworkContext';

// Refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// JS-side colors — icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Admin endpoints and their row shapes
import {
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
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native';
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
// ROLE_LABEL_KEYS
// -----------------------------------------------------------
//
// Known roles map to catalog keys; an unknown role from a
// newer backend renders as its raw name instead of crashing.
//
// Used by:
//   - roleLabel (below)
// -----------------------------------------------------------

const ROLE_LABEL_KEYS: Record<string, string> = {
  student: 'admin.roleStudent',
  teacher: 'admin.roleTeacher',
  curator: 'admin.roleCurator',
  admin: 'admin.roleAdmin',
};

// Translate where a key exists, pass the raw role through
// where none does
const roleLabel = (t: TFunction, role: string): string =>
  ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role;







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
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (params: CreateParams) => void;
}) {

  const { t } = useTranslation();
  const [role, setRole] = useState<string>('student');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresHours, setExpiresHours] = useState(24);


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
        {ROLE_OPTIONS.map((option) => (
          <Chip
            key={option}
            label={roleLabel(t, option)}
            selected={role === option}
            onPress={() => setRole(option)}
          />
        ))}
      </View>

      <Text className="mb-sm font-raleway-medium text-sm text-ink-soft">{t('admin.maxUses')}</Text>
      <View className="mb-md flex-row flex-wrap gap-sm">
        {MAX_USES_OPTIONS.map((option) => (
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
        {EXPIRY_HOURS_OPTIONS.map((option) => (
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

      {showForm && <CreateInvitationForm creating={creating} onCreate={onCreate} />}

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
// a status pill. QR is offered on any active code; revoking
// is admin-only.
//
// Used by:
//   - AdminScreen (below) — FlatList renderItem
// -----------------------------------------------------------

function InvitationCard({
  item,
  isAdmin,
  onCopy,
  onShowQr,
  onRevoke,
}: {
  item: AdminInvitation;
  isAdmin: boolean;
  onCopy: () => void;
  onShowQr: () => void;
  onRevoke: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const spent = item.expired || item.fullyUsed;


  return (
    <Card className="mx-md mb-sm">

      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={onCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.copy')}
          className="flex-1 flex-row items-center gap-sm"
        >
          <Text className={spent ? 'font-mono text-lg text-ink-faint' : 'font-mono text-lg text-brand'}>
            {item.code}
          </Text>
          <Ionicons name="copy-outline" size={16} color={spent ? colors.inkFaint : colors.brand} />
        </Pressable>

        <View className="flex-row items-center gap-md">
          {!spent && (
            <Pressable
              onPress={onShowQr}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('admin.showQr')}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.brand} />
            </Pressable>
          )}
          {!spent && isAdmin && (
            <Pressable
              onPress={onRevoke}
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
}







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
    <Modal visible={!!invitation} animationType="fade" transparent onRequestClose={onClose}>
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

            <Text className="mt-md font-mono text-lg text-brand">{invitation.code}</Text>

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
//   - app/(main)/settings/index.tsx — the admin panel link
// -----------------------------------------------------------

export default function AdminScreen() {

  const { t } = useTranslation();
  const { user } = useAuth();
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


  // One code path for first load, retry, refresh and restore;
  // stats failures never take the invitation list down
  const load = async (showSpinner: boolean): Promise<void> => {
    if (showSpinner) {
      setLoading(true);
      setFailed(false);
    }

    try {
      const { invitations: list } = await fetchAdminInvitations();
      setInvitations(list);
      hasData.current = true;
      setFailed(false);
    } catch {
      if (hasData.current) showToast('error', t('admin.loadError'));
      else setFailed(true);
    }

    if (isAdmin) {
      try {
        setStats(await fetchAdminStats());
      } catch {
        // Tiles simply stay hidden; codes still work
      }
    }

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
      setInvitations((previous) => [created, ...(previous ?? [])]);
      setShowForm(false);
      showToast('success', t('admin.codeCreated', { code: created.code }));
    } catch {
      showToast('error', t('admin.createError'));
    } finally {
      setCreating(false);
    }
  };


  // Cancel is 'Grįžti'-style common.back — the LT verb
  // "Atšaukti" would otherwise open BOTH buttons of a
  // destructive confirm
  const handleRevoke = async (invitation: AdminInvitation): Promise<void> => {
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
    } catch {
      showToast('error', t('admin.revokeError'));
    }
  };


  // Toast only after the clipboard actually took the code
  const handleCopy = (code: string) => {
    Clipboard.setStringAsync(code)
      .then(() => showToast('success', t('admin.codeCopied')))
      .catch(() => {});
  };


  if (!canView) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title={t('admin.noAccess')} />
      </Screen>
    );
  }


  if (loading) {
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
        data={invitations ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InvitationCard
            item={item}
            isAdmin={isAdmin}
            onCopy={() => handleCopy(item.code)}
            onShowQr={() => setQrInvitation(item)}
            onRevoke={() => void handleRevoke(item)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
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
        onCopy={handleCopy}
        onClose={() => setQrInvitation(null)}
      />

    </Screen>
  );
}
