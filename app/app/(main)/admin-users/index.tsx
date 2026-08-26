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
//  Backend gap worth knowing (services/api/admin.ts): the
//  list and update responses do not echo the `active` flag
//  yet, so the deactivated pill and the activate action only
//  appear after a toggle in this session — on reload every
//  row reads as active again. Deactivation is also advisory
//  server-side for now (sessions dropped, next login not yet
//  blocked).
//
//  The role modal locks its rows while a PATCH is in flight,
//  and re-picking the user's current role just closes the
//  modal — no duplicate or no-op requests.
//
//  Split into (root component last):
//
//    ROLE_LABEL_KEYS  — role → catalog-key map
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
  Screen,
  confirmAction,
} from '@/components/ui';

// Session role gate and the self-row check
import { useAuth } from '@/context/AuthContext';

// Non-blocking feedback
import { showToast } from '@/context/NetworkContext';

// Refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// JS-side colors — icons, placeholder, refresh tint
import { useTheme } from '@/hooks/useTheme';

// Admin endpoints and the row shape
import { fetchAdminUsers, updateAdminUser, type AdminUser } from '@/services/api';

// Keyboard offset under the native stack header
import { useHeaderHeight } from '@react-navigation/elements';

// Icons, list, modal and keyboard primitives
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';


// The roles a user can be switched to, in picker order
const ROLE_OPTIONS = ['student', 'teacher', 'curator', 'admin'] as const;

// Badge tint per role — semantic washes only; info has no
// soft token, so teacher sits on surface-soft
const ROLE_BADGE_CLASSES: Record<string, { wash: string; text: string }> = {
  admin: { wash: 'bg-danger-soft', text: 'text-danger' },
  curator: { wash: 'bg-warning-soft', text: 'text-warning' },
  teacher: { wash: 'bg-surface-soft', text: 'text-info' },
  student: { wash: 'bg-surface-soft', text: 'text-ink-soft' },
};







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
// but the signed-in admin — the change-role and activate/
// deactivate actions. `busy` locks the actions while this
// row's PATCH is in flight.
//
// Used by:
//   - AdminUsersScreen (below) — FlatList renderItem
// -----------------------------------------------------------

function UserCard({
  item,
  isSelf,
  busy,
  onChangeRole,
  onToggleActive,
}: {
  item: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onChangeRole: () => void;
  onToggleActive: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // `active` is only known after a toggle — see the file header
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
            onPress={onChangeRole}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('admin.changeRole')}
            accessibilityState={{ disabled: busy }}
            className={`flex-row items-center gap-xs rounded-md bg-surface-soft px-md py-sm ${busy ? 'opacity-50' : ''}`}
          >
            <Ionicons name="swap-horizontal" size={14} color={colors.inkSoft} />
            <Text className="font-raleway-medium text-xs text-ink-soft">{t('admin.changeRole')}</Text>
          </Pressable>

          <Pressable
            onPress={onToggleActive}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={deactivated ? t('admin.activate') : t('admin.deactivate')}
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

        </View>
      )}

    </Card>
  );
}







// -----------------------------------------------------------
// RoleModal
// -----------------------------------------------------------
//
// The role picker for one user. Rows disable while `saving`,
// the current role is marked and selecting it again is a pure
// dismiss — the short-circuit lives in the root handler.
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
  onSelect: (role: string) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Modal visible={!!user} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-lg">

        <Pressable
          className="absolute inset-0 bg-scrim"
          onPress={onClose}
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
  const { user: currentUser } = useAuth();
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


  const load = async (showSpinner: boolean): Promise<void> => {
    if (showSpinner) {
      setLoading(true);
      setFailed(false);
    }

    try {
      const { users: list } = await fetchAdminUsers();
      setUsers(list);
      hasData.current = true;
      setFailed(false);
    } catch {
      if (hasData.current) showToast('error', t('admin.loadError'));
      else setFailed(true);
    }

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


  // Live client-side filter across every field a row shows
  const filteredUsers = useMemo(() => {
    const list = users ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.displayName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.role.toLowerCase().includes(query),
    );
  }, [users, search]);


  const onRefresh = () => {
    setRefreshing(true);
    void load(false).finally(() => setRefreshing(false));
  };


  const handleSelectRole = async (role: string): Promise<void> => {
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
      setUsers((previous) =>
        (previous ?? []).map((u) => (u.id === target.id ? { ...u, role: updated.role } : u)),
      );
      setEditingUser(null);
      showToast('success', t('admin.userUpdated'));
    } catch {
      showToast('error', t('admin.userUpdateError'));
    } finally {
      setSavingRole(false);
    }
  };


  // Deactivation confirms (destructive, distinct cancel);
  // re-activation is safe and goes straight through
  const handleToggleActive = async (target: AdminUser): Promise<void> => {
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
      await updateAdminUser(target.id, { active: !deactivating });
      setUsers((previous) =>
        (previous ?? []).map((u) => (u.id === target.id ? { ...u, active: !deactivating } : u)),
      );
      showToast('success', t('admin.userUpdated'));
    } catch {
      showToast('error', t('admin.userUpdateError'));
    } finally {
      setTogglingId(null);
    }
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >

        <SearchBar value={search} count={filteredUsers.length} onChange={setSearch} />

        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserCard
              item={item}
              isSelf={item.id === currentUser?.id}
              busy={togglingId === item.id}
              onChangeRole={() => setEditingUser(item)}
              onToggleActive={() => void handleToggleActive(item)}
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
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
          ItemSeparatorComponent={() => <View className="h-sm" />}
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
