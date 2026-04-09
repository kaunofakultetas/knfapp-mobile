import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { fetchAdminUsers, updateAdminUser, type AdminUser } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';

const ROLE_OPTIONS = ['student', 'teacher', 'curator', 'admin'] as const;

export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Role change modal
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users);
    } catch {
      showToast('error', t('admin.loadError'));
    }
  }, [t]);

  useEffect(() => {
    loadUsers().finally(() => setLoading(false));
  }, [loadUsers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      const updated = await updateAdminUser(userId, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
      setEditingUser(null);
      showToast('success', t('admin.userUpdated'));
    } catch {
      showToast('error', t('admin.userUpdateError'));
    }
  };

  const handleDeactivate = (user: AdminUser) => {
    if (user.id === currentUser?.id) {
      showToast('error', t('admin.cannotDeactivateSelf'));
      return;
    }
    Alert.alert(
      t('admin.deactivate'),
      t('admin.deactivateConfirm'),
      [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('admin.deactivate'),
          style: 'destructive',
          onPress: async () => {
            try {
              await updateAdminUser(user.id, { active: false });
              setUsers((prev) => prev.filter((u) => u.id !== user.id));
              showToast('success', t('admin.userUpdated'));
            } catch {
              showToast('error', t('admin.userUpdateError'));
            }
          },
        },
      ],
    );
  };

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      student: t('admin.roleStudent'),
      teacher: t('admin.roleTeacher'),
      curator: t('admin.roleCurator'),
      admin: t('admin.roleAdmin'),
    };
    return labels[role] || role;
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#dc2626';
      case 'curator': return '#d97706';
      case 'teacher': return '#2563eb';
      default: return '#6b7280';
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Ionicons name="lock-closed" size={48} color="#ccc" />
        <Text className="text-gray-400 mt-4">{t('admin.noAccess')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search bar */}
      <View className="px-4 pt-3 pb-2 bg-white border-b border-gray-200">
        <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            className="flex-1 ml-2 text-base text-gray-900"
            placeholder={t('admin.search')}
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </Pressable>
          )}
        </View>
        <Text className="text-xs text-gray-400 mt-1.5">
          {filteredUsers.length} {t('admin.users').toLowerCase()}
        </Text>
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B003F" />
        }
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => {
          const isSelf = item.id === currentUser?.id;
          return (
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-bold text-gray-900">
                    {item.displayName}
                    {isSelf && (
                      <Text className="text-sm text-gray-400"> (you)</Text>
                    )}
                  </Text>
                  <Text className="text-sm text-gray-500 mt-0.5">@{item.username}</Text>
                  <Text className="text-xs text-gray-400 mt-0.5">{item.email}</Text>
                </View>
                <View
                  style={{ backgroundColor: `${roleColor(item.role)}15` }}
                  className="rounded-full px-3 py-1"
                >
                  <Text style={{ color: roleColor(item.role) }} className="text-xs font-bold">
                    {roleLabel(item.role)}
                  </Text>
                </View>
              </View>

              {!isSelf && (
                <View className="flex-row mt-3 pt-3 border-t border-gray-100 gap-2">
                  <Pressable
                    className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2"
                    onPress={() => setEditingUser(item)}
                  >
                    <Ionicons name="swap-horizontal" size={14} color="#666" />
                    <Text className="text-xs text-gray-600 ml-1.5">{t('admin.changeRole')}</Text>
                  </Pressable>
                  <Pressable
                    className="flex-row items-center bg-red-50 rounded-lg px-3 py-2"
                    onPress={() => handleDeactivate(item)}
                  >
                    <Ionicons name="ban" size={14} color="#dc2626" />
                    <Text className="text-xs text-red-600 ml-1.5">{t('admin.deactivate')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text className="text-gray-400 mt-3">{t('admin.userList')}</Text>
          </View>
        }
      />

      {/* Role change modal */}
      <Modal
        visible={!!editingUser}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingUser(null)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center"
          onPress={() => setEditingUser(null)}
        >
          <Pressable className="bg-white rounded-2xl mx-6 p-5 w-[85%] max-w-[360px]" onPress={() => {}}>
            <Text className="text-lg font-bold text-gray-900 mb-1">
              {t('admin.changeRole')}
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              {editingUser?.displayName} (@{editingUser?.username})
            </Text>

            {ROLE_OPTIONS.map((role) => (
              <Pressable
                key={role}
                onPress={() => {
                  if (editingUser) handleChangeRole(editingUser.id, role);
                }}
                className={`py-3 px-4 rounded-lg mb-1 flex-row items-center justify-between ${
                  editingUser?.role === role ? 'bg-primary/10' : ''
                }`}
              >
                <Text
                  className={`text-base ${editingUser?.role === role ? 'text-primary font-bold' : 'text-gray-700'}`}
                >
                  {roleLabel(role)}
                </Text>
                {editingUser?.role === role && (
                  <Ionicons name="checkmark-circle" size={20} color="#7B003F" />
                )}
              </Pressable>
            ))}

            <Pressable
              onPress={() => setEditingUser(null)}
              className="mt-3 py-3 rounded-xl bg-gray-100 items-center"
            >
              <Text className="text-gray-700 font-bold">{t('common.back')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
