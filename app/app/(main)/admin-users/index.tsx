// -----------------------------------------------------------
//  [*] Admin — user management
//
//  The admin-only user list pushed from the admin dashboard:
//  live client-side search over every visible field, a role
//  picker modal, and an activate/deactivate toggle. Any other
//  role (curators included) gets the no-access EmptyState and
//  NO api call is fired — the old screen 403'd and toasted an
//  error over that very screen.
//
//  The `active` flag round-trips on both the list and the
//  update responses (services/api/admin.ts), so the
//  deactivated pill survives a reload. Deactivation is
//  enforced server-side: the user's sessions are dropped and
//  login is refused until re-activation.
//
//  The role modal locks its rows while a PATCH is in flight,
//  and re-picking the user's current role just closes the
//  modal — no duplicate or no-op requests.
//
//  Split into (root component last):
//
//    adminErrorKey    — failure → catalog-key map
//    fold             — diacritic-insensitive search fold
//    RoleBadge        — tinted role pill
//    SearchBar        — filter input + result count
//    UserCard         — one user row with its actions
//    RoleModal        — busy-locked role picker
//    AdminUsersScreen — data, gates, actions (default export)
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
  confirmAction,
} from '@/components/ui';

// Session role gate and the self-row check
import { useAuth } from '@/context/AuthContext';

// Non-blocking feedback
import { showToast } from '@/context/NetworkContext';

// Refetch when connectivity returns
import { useNetworkRestore } from '@knf/dataengine';

// JS-side colors — icons, placeholder, refresh tint
import { useTheme } from '@/hooks/useTheme';

// Shared role → label map (falls back to the raw role name)
import { roleLabel } from '@/constants/roles';

// Admin endpoints, the row shape and the error type the
// catch sites branch on
import { ApiError, deleteAdminUser, fetchAdminUsers, updateAdminUser, type AdminUser } from '@/services/api';

// Keyboard offset under the native stack header
import { useHeaderHeight } from '@react-navigation/elements';

// Icons, list, modal and keyboard primitives
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';


// The roles a user can be switched to, in picker order
const ROLE_OPTIONS = ['student', 'teacher', 'curator', 'admin'] as const;

// One picker choice — matches updateAdminUser's role param
type RoleOption = (typeof ROLE_OPTIONS)[number];

// Badge tint per role — semantic washes only; info has no
// soft token, so teacher sits on surface-soft
const ROLE_BADGE_CLASSES: Record<string, { wash: string; text: string }> = {
  admin: { wash: 'bg-danger-soft', text: 'text-danger' },
  curator: { wash: 'bg-warning-soft', text: 'text-warning' },
  teacher: { wash: 'bg-surface-soft', text: 'text-info' },
  student: { wash: 'bg-surface-soft', text: 'text-ink-soft' },
};







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
//   - AdminUsersScreen (below) — load / role / active catches
// -----------------------------------------------------------

const adminErrorKey = (err: unknown, fallbackKey: string): string => {
  if (err instanceof ApiError && err.code === 'timeout') return 'toast.timeout';
  if (err instanceof ApiError && err.code === 'network') return 'toast.networkError';
  if (err instanceof ApiError && err.status === 403) return 'admin.noPermission';
  return fallbackKey;
};







// -----------------------------------------------------------
// fold
// -----------------------------------------------------------
//
// Case- and diacritic-insensitive fold for the live filter:
// NFD splits letters from their combining marks, which are
// then stripped — so 'simkute' finds 'Šimkutė'.
//
// Used by:
//   - AdminUsersScreen (below) — the search haystack and query
// -----------------------------------------------------------

const fold = (value: string): string =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');


// Stable list separator — an inline closure would remount
// every separator on each list re-render
const Separator = () => <View className="h-sm" />;







// -----------------------------------------------------------
// RoleBadge
// -----------------------------------------------------------
//
// Used by:
//   - UserCard (below) — the right-hand role pill
// -----------------------------------------------------------

function RoleBadge({ role }: { role: string }) {

  const { t } = useTranslation();


  const classes = ROLE_BADGE_CLASSES[role] ?? ROLE_BADGE_CLASSES.student;


  return (
    <View className={`rounded-full px-md py-xs ${classes.wash}`}>
      <Text className={`font-raleway-bold text-xs ${classes.text}`}>{roleLabel(t, role)}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// SearchBar
// -----------------------------------------------------------
//
// Filter-as-you-type input on a surface strip, with the
// visible result count underneath. Filtering itself lives in
// the root's useMemo — this component only carries the text.
//
// Used by:
//   - AdminUsersScreen (below) — pinned above the list
// -----------------------------------------------------------

function SearchBar({
  value,
  count,
  onChange,
}: {
  value: string;
  count: number;
  onChange: (text: string) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="border-b border-line bg-surface px-md py-sm">

      <View className="h-12 flex-row items-center gap-sm rounded-md bg-surface-soft px-md">
        <Ionicons name="search" size={18} color={colors.inkFaint} />
        <TextInput
          className="flex-1 py-0 font-raleway text-base text-ink"
          placeholder={t('admin.search')}
          placeholderTextColor={colors.inkFaint}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('admin.search')}
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => onChange('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
          >
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </Pressable>
        )}
      </View>

      <Text className="mt-xs font-raleway text-xs text-ink-soft">
        {t('admin.userCount', { count })}
      </Text>

    </View>
  );
}







// -----------------------------------------------------------
// UserCard
// -----------------------------------------------------------
//
// One user row: identity block, role pill, and — for everyone
// but the signed-in admin — the change-role, activate/
// deactivate and erase actions. `busy` locks the actions
// while this row's request is in flight.
//
// Memoized with item-taking handlers — the search field above
// re-renders the screen per keystroke, and unchanged rows
// must not re-render with it.
//
// Used by:
//   - AdminUsersScreen (below) — FlatList renderItem
// -----------------------------------------------------------

const UserCard = memo(function UserCard({
  item,
  isSelf,
  busy,
  onChangeRole,
  onToggleActive,
  onErase,
}: {
  item: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onChangeRole: (item: AdminUser) => void;
  onToggleActive: (item: AdminUser) => void;
  onErase: (item: AdminUser) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // `active` round-trips on list and update; only an older
  // backend omits it, and an unknown flag reads as active
  const deactivated = item.active === false;


  return (
    <Card className="mx-md">

      <View className="flex-row items-center justify-between">
        <View className="mr-md flex-1">
          <Text className="font-raleway-bold text-base text-ink">
            {item.displayName}
            {isSelf && (
              <Text className="font-raleway text-sm text-ink-faint"> ({t('admin.you')})</Text>
            )}
          </Text>
          <Text className="mt-xs font-raleway text-sm text-ink-soft">@{item.username}</Text>
          <Text className="mt-xs font-raleway text-xs text-ink-faint">{item.email}</Text>
        </View>

        <View className="items-end gap-xs">
          <RoleBadge role={item.role} />
          {deactivated && (
            <View className="rounded-full bg-danger-soft px-md py-xs">
              <Text className="font-raleway-bold text-xs text-danger">{t('admin.deactivated')}</Text>
            </View>
          )}
        </View>
      </View>

      {!isSelf && (
        <View className="mt-md flex-row gap-sm border-t border-line pt-md">

          <Pressable
            onPress={() => onChangeRole(item)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            // The subject rides in the label — every row saying
            // just "Change role" is unnavigable by ear
            accessibilityLabel={t('admin.changeRoleFor', { name: item.displayName })}
            accessibilityState={{ disabled: busy }}
            className={`flex-row items-center gap-xs rounded-md bg-surface-soft px-md py-sm ${busy ? 'opacity-50' : ''}`}
          >
            <Ionicons name="swap-horizontal" size={14} color={colors.inkSoft} />
            <Text className="font-raleway-medium text-xs text-ink-soft">{t('admin.changeRole')}</Text>
          </Pressable>

          <Pressable
            onPress={() => onToggleActive(item)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              deactivated
                ? t('admin.activateUser', { name: item.displayName })
                : t('admin.deactivateUser', { name: item.displayName })
            }
            accessibilityState={{ disabled: busy }}
            className={`flex-row items-center gap-xs rounded-md px-md py-sm ${deactivated ? 'bg-success-soft' : 'bg-danger-soft'} ${busy ? 'opacity-50' : ''}`}
          >
            <Ionicons
              name={deactivated ? 'checkmark-circle-outline' : 'ban-outline'}
              size={14}
              color={deactivated ? colors.success : colors.danger}
            />
            <Text
              className={`font-raleway-medium text-xs ${deactivated ? 'text-success' : 'text-danger'}`}
            >
              {deactivated ? t('admin.activate') : t('admin.deactivate')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onErase(item)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('admin.eraseUserFor', { name: item.displayName })}
            accessibilityState={{ disabled: busy }}
            className={`flex-row items-center gap-xs rounded-md bg-danger-soft px-md py-sm ${busy ? 'opacity-50' : ''}`}
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text className="font-raleway-medium text-xs text-danger">{t('admin.erase')}</Text>
          </Pressable>

        </View>
      )}

    </Card>
  );
});







// -----------------------------------------------------------
// RoleModal
// -----------------------------------------------------------
//
// The role picker for one user. Rows disable while `saving` —
// as do the backdrop and the hardware back, so a PATCH in
// flight cannot be dismissed under its own toast; the current
// role is marked and selecting it again is a pure dismiss —
// the short-circuit lives in the root handler.
//
// Used by:
//   - AdminUsersScreen (below) — mounted once, fed by editingUser
// -----------------------------------------------------------

function RoleModal({
  user,
  saving,
  onSelect,
  onClose,
}: {
  user: AdminUser | null;
  saving: boolean;
  onSelect: (role: RoleOption) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Modal
      visible={!!user}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={saving ? () => {} : onClose}
    >
      <View className="flex-1 items-center justify-center px-lg">

        <Pressable
          className="absolute inset-0 bg-scrim"
          onPress={onClose}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />

        {user && (
          <View className="w-full max-w-[360px] rounded-2xl bg-surface p-lg">

            <Text className="font-raleway-bold text-lg text-ink">{t('admin.changeRole')}</Text>
            <Text className="mb-md mt-xs font-raleway text-sm text-ink-soft">
              {user.displayName} (@{user.username})
            </Text>

            {ROLE_OPTIONS.map((role) => {
              const current = user.role === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => onSelect(role)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={roleLabel(t, role)}
                  accessibilityState={{ selected: current, disabled: saving }}
                  className={`mb-xs flex-row items-center justify-between rounded-md px-md py-md ${current ? 'bg-brand-soft' : ''} ${saving ? 'opacity-50' : ''}`}
                >
                  <Text
                    className={
                      current
                        ? 'font-raleway-bold text-base text-brand'
                        : 'font-raleway text-base text-ink'
                    }
                  >
                    {roleLabel(t, role)}
                  </Text>
                  {current && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
                </Pressable>
              );
            })}

            <View className="mt-sm">
              <Button
                title={t('common.back')}
                variant="secondary"
                disabled={saving}
                onPress={onClose}
              />
            </View>

          </View>
        )}

      </View>
    </Modal>
  );
}







// -----------------------------------------------------------
// AdminUsersScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /admin-users
//   - app/(main)/admin/index.tsx — the manage-users card
// -----------------------------------------------------------

export default function AdminUsersScreen() {

  const { t } = useTranslation();
  const { user: currentUser, hydrated } = useAuth();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();


  const canView = currentUser?.role === 'admin';


  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(canView);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);


  // Mirror for async failure semantics: a failed refresh
  // behind shown data toasts, a failed first load errors
  const hasData = useRef(false);


  // Only the newest request may write — a slow response from
  // before a refresh, retry or restore is dropped
  const seqRef = useRef(0);


  const load = async (showSpinner: boolean): Promise<void> => {
    const seq = ++seqRef.current;
    if (showSpinner) {
      setLoading(true);
      setFailed(false);
    }

    try {
      const { users: list } = await fetchAdminUsers();
      if (seq !== seqRef.current) return;
      setUsers(list);
      hasData.current = true;
      setFailed(false);
    } catch (err) {
      if (seq !== seqRef.current) return;
      if (hasData.current) showToast('error', t(adminErrorKey(err, 'admin.loadError')));
      else setFailed(true);
    }

    if (seq !== seqRef.current) return;
    if (showSpinner) setLoading(false);
  };


  // Fetching is gated on the admin role — deep-linking here as
  // any other role must not 403 + toast over the no-access body
  useEffect(() => {
    if (canView) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);


  // Back online: silent refetch behind shown data, full
  // spinner over nothing
  useNetworkRestore(() => {
    if (canView) void load(!hasData.current);
  });


  // Live client-side filter across every field a row shows —
  // the VISIBLE role label included ("Dėstytojas" must match,
  // not just the English slug), everything diacritic-folded
  const filteredUsers = useMemo(() => {
    const list = users ?? [];
    const query = fold(search.trim());
    if (!query) return list;
    return list.filter((u) =>
      fold(
        `${u.username} ${u.displayName} ${u.email} ${u.role} ${roleLabel(t, u.role)}`,
      ).includes(query),
    );
  }, [users, search, t]);


  const onRefresh = () => {
    setRefreshing(true);
    void load(false).finally(() => setRefreshing(false));
  };


  const handleSelectRole = async (role: RoleOption): Promise<void> => {
    const target = editingUser;
    if (!target) return;

    // Re-picking the current role means "keep it" — dismiss
    // without a request
    if (role === target.role) {
      setEditingUser(null);
      return;
    }

    setSavingRole(true);
    try {
      const updated = await updateAdminUser(target.id, { role });
      // The PATCH echo is the truth — replace the whole row
      // rather than merging a locally guessed value
      setUsers((previous) => (previous ?? []).map((u) => (u.id === target.id ? updated : u)));
      setEditingUser(null);
      showToast('success', t('admin.userUpdated'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Deleted elsewhere — drop the stale row
        setUsers((previous) => (previous ?? []).filter((u) => u.id !== target.id));
        setEditingUser(null);
        showToast('info', t('admin.userGone'));
      } else {
        showToast('error', t(adminErrorKey(err, 'admin.userUpdateError')));
      }
    } finally {
      setSavingRole(false);
    }
  };


  // Deactivation confirms (destructive, distinct cancel);
  // re-activation is safe and goes straight through
  const handleToggleActive = useCallback(
    async (target: AdminUser): Promise<void> => {
      if (target.id === currentUser?.id) {
        showToast('error', t('admin.cannotDeactivateSelf'));
        return;
      }

      const deactivating = target.active !== false;
      if (deactivating) {
        const confirmed = await confirmAction({
          title: t('admin.deactivate'),
          message: t('admin.deactivateConfirm'),
          confirmLabel: t('admin.deactivate'),
          cancelLabel: t('common.back'),
          destructive: true,
        });
        if (!confirmed) return;
      }

      setTogglingId(target.id);
      try {
        const updated = await updateAdminUser(target.id, { active: !deactivating });
        // The PATCH echo is the truth — replace the whole row
        // rather than merging a locally guessed value
        setUsers((previous) => (previous ?? []).map((u) => (u.id === target.id ? updated : u)));
        showToast('success', t('admin.userUpdated'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // Deleted elsewhere — drop the stale row
          setUsers((previous) => (previous ?? []).filter((u) => u.id !== target.id));
          showToast('info', t('admin.userGone'));
        } else {
          showToast('error', t(adminErrorKey(err, 'admin.userUpdateError')));
        }
      } finally {
        setTogglingId(null);
      }
    },
    [currentUser?.id, t],
  );


  // Erasure: confirmed (destructive, irreversible), then the
  // row leaves the list — the backend keeps an anonymised
  // shell, but that shell is nobody's account any more
  const handleErase = useCallback(
    async (target: AdminUser): Promise<void> => {
      if (target.id === currentUser?.id) {
        showToast('error', t('admin.cannotDeactivateSelf'));
        return;
      }

      const confirmed = await confirmAction({
        title: t('admin.eraseTitle'),
        message: t('admin.eraseConfirm'),
        confirmLabel: t('admin.erase'),
        cancelLabel: t('common.back'),
        destructive: true,
      });
      if (!confirmed) return;

      setTogglingId(target.id);
      try {
        await deleteAdminUser(target.id);
        setUsers((previous) => (previous ?? []).filter((u) => u.id !== target.id));
        showToast('success', t('admin.userErased'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setUsers((previous) => (previous ?? []).filter((u) => u.id !== target.id));
          showToast('info', t('admin.userGone'));
        } else {
          showToast('error', t(adminErrorKey(err, 'admin.userUpdateError')));
        }
      } finally {
        setTogglingId(null);
      }
    },
    [currentUser?.id, t],
  );


  // Stable per-row callbacks so the memoized cards only
  // re-render when their own user changes
  const handleChangeRole = useCallback((item: AdminUser) => setEditingUser(item), []);

  const handleToggleRow = useCallback(
    (item: AdminUser) => void handleToggleActive(item),
    [handleToggleActive],
  );

  const handleEraseRow = useCallback(
    (item: AdminUser) => void handleErase(item),
    [handleErase],
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminUser }) => (
      <UserCard
        item={item}
        isSelf={item.id === currentUser?.id}
        busy={togglingId === item.id}
        onChangeRole={handleChangeRole}
        onToggleActive={handleToggleRow}
        onErase={handleEraseRow}
      />
    ),
    [currentUser?.id, togglingId, handleChangeRole, handleToggleRow, handleEraseRow],
  );


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


  // The null-users check also covers the first frame after
  // hydration, before the load effect has committed
  if (loading || (users === null && !failed)) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (failed && users === null) {
    return (
      <Screen>
        <ErrorState message={t('admin.loadError')} onRetry={() => void load(true)} />
      </Screen>
    );
  }


  return (
    <Screen>

      <KeyboardAvoidingView
        className="flex-1"
        // Android needs 'height' — undefined leaves the list
        // stuck under the keyboard
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >

        <SearchBar value={search} count={filteredUsers.length} onChange={setSearch} />

        <FlatList
          data={filteredUsers}
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
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title={t('admin.noUsersFound')} />
          }
          keyboardShouldPersistTaps="handled"
        />

      </KeyboardAvoidingView>

      <RoleModal
        user={editingUser}
        saving={savingRole}
        onSelect={(role) => void handleSelectRole(role)}
        onClose={() => setEditingUser(null)}
      />

    </Screen>
  );
}
