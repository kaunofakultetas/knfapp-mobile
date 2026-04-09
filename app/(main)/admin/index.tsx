import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import {
  createInvitation,
  fetchAdminInvitations,
  fetchAdminStats,
  revokeInvitation,
  type AdminInvitation,
  type AdminStats,
} from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const ROLE_OPTIONS = ['student', 'teacher', 'curator', 'admin'] as const;

export default function AdminScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  // New invitation form state
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState<string>('student');
  const [newMaxUses, setNewMaxUses] = useState(1);
  const [newExpiresHours, setNewExpiresHours] = useState(24);

  // QR code modal state
  const [qrInvitation, setQrInvitation] = useState<AdminInvitation | null>(null);

  const loadData = useCallback(async () => {
    try {
      const invData = await fetchAdminInvitations();
      setInvitations(invData.invitations);
    } catch {
      showToast('error', t('admin.loadError', 'Nepavyko užkrauti duomenų'));
    }
    // Stats are admin-only; curators can still manage invitations
    try {
      const statsData = await fetchAdminStats();
      setStats(statsData);
    } catch {
      // Curators don't have access to stats — that's OK
    }
  }, [t]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const inv = await createInvitation({
        role: newRole,
        max_uses: newMaxUses,
        expires_hours: newExpiresHours,
      });
      setInvitations((prev) => [inv, ...prev]);
      setShowForm(false);
      showToast('success', t('admin.codeCreated', 'Kodas sukurtas: ') + inv.code);
    } catch {
      showToast('error', t('admin.createError', 'Nepavyko sukurti kodo'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (inv: AdminInvitation) => {
    Alert.alert(
      t('admin.revokeTitle', 'Atšaukti kodą'),
      t('admin.revokeConfirm', 'Ar tikrai norite atšaukti šį kvietimo kodą?'),
      [
        { text: t('common.cancel', 'Atšaukti'), style: 'cancel' },
        {
          text: t('admin.revoke', 'Atšaukti kodą'),
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeInvitation(inv.id);
              setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
              showToast('success', t('admin.codeRevoked', 'Kodas atšauktas'));
            } catch {
              showToast('error', t('admin.revokeError', 'Nepavyko atšaukti'));
            }
          },
        },
      ]
    );
  };

  const copyCode = async (code: string) => {
    await Clipboard.setStringAsync(code);
    showToast('success', t('admin.codeCopied', 'Kodas nukopijuotas'));
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('lt-LT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      student: t('admin.roleStudent', 'Studentas'),
      teacher: t('admin.roleTeacher', 'Dėstytojas'),
      curator: t('admin.roleCurator', 'Kuratorius'),
      admin: t('admin.roleAdmin', 'Administratorius'),
    };
    return labels[role] || role;
  };

  if (user?.role !== 'admin' && user?.role !== 'curator') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Ionicons name="lock-closed" size={48} color="#ccc" />
        <Text className="text-gray-400 mt-4">{t('admin.noAccess', 'Neturite prieigos')}</Text>
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
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B003F" />
        }
        ListHeaderComponent={
          <View>
            {/* Stats cards */}
            {stats && (
              <View className="flex-row flex-wrap px-4 pt-4 gap-2">
                <StatCard label={t('admin.users', 'Vartotojai')} value={stats.users} icon="people" />
                <StatCard label={t('admin.posts', 'Įrašai')} value={stats.posts} icon="newspaper" />
                <StatCard label={t('admin.articles', 'Straipsniai')} value={stats.scrapedArticles} icon="globe" />
                <StatCard label={t('admin.invites', 'Kvietimai')} value={stats.activeInvitations} icon="ticket" />
              </View>
            )}

            {/* Create invitation */}
            <View className="mx-4 mt-4">
              <Pressable
                className="bg-[#7B003F] rounded-xl py-3 px-5 flex-row items-center justify-center"
                onPress={() => setShowForm(!showForm)}
              >
                <Ionicons name={showForm ? 'close' : 'add'} size={20} color="white" />
                <Text className="text-white font-semibold ml-2">
                  {showForm
                    ? t('common.cancel', 'Atšaukti')
                    : t('admin.createInvitation', 'Naujas kvietimo kodas')}
                </Text>
              </Pressable>

              {showForm && (
                <View className="bg-white rounded-xl mt-3 p-4 shadow-sm">
                  {/* Role picker */}
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    {t('admin.role', 'Rolė')}
                  </Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {ROLE_OPTIONS.map((role) => (
                      <Pressable
                        key={role}
                        className={`px-3 py-1.5 rounded-full ${newRole === role ? 'bg-[#7B003F]' : 'bg-gray-100'}`}
                        onPress={() => setNewRole(role)}
                      >
                        <Text className={`text-sm ${newRole === role ? 'text-white font-medium' : 'text-gray-700'}`}>
                          {roleLabel(role)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Max uses picker */}
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    {t('admin.maxUses', 'Panaudojimų limitas')}
                  </Text>
                  <View className="flex-row gap-2 mb-4">
                    {[1, 5, 10, 25, 100].map((n) => (
                      <Pressable
                        key={n}
                        className={`px-3 py-1.5 rounded-full ${newMaxUses === n ? 'bg-[#7B003F]' : 'bg-gray-100'}`}
                        onPress={() => setNewMaxUses(n)}
                      >
                        <Text className={`text-sm ${newMaxUses === n ? 'text-white font-medium' : 'text-gray-700'}`}>
                          {n}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Expiry picker */}
                  <Text className="text-sm font-medium text-gray-700 mb-2">
                    {t('admin.expires', 'Galiojimo laikas')}
                  </Text>
                  <View className="flex-row gap-2 mb-4">
                    {[
                      { h: 1, label: '1h' },
                      { h: 24, label: '1d' },
                      { h: 72, label: '3d' },
                      { h: 168, label: '7d' },
                      { h: 720, label: '30d' },
                    ].map(({ h, label }) => (
                      <Pressable
                        key={h}
                        className={`px-3 py-1.5 rounded-full ${newExpiresHours === h ? 'bg-[#7B003F]' : 'bg-gray-100'}`}
                        onPress={() => setNewExpiresHours(h)}
                      >
                        <Text className={`text-sm ${newExpiresHours === h ? 'text-white font-medium' : 'text-gray-700'}`}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Pressable
                    className="bg-[#7B003F] rounded-xl py-3 items-center"
                    onPress={handleCreate}
                    disabled={creating}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-semibold">
                        {t('admin.generate', 'Generuoti kodą')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>

            {/* Section header */}
            <Text className="text-sm font-semibold text-gray-500 px-4 mt-5 mb-2">
              {t('admin.activeCodes', 'Aktyvūs kvietimo kodai')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isExpired = item.expired || item.fullyUsed;
          return (
            <View className={`mx-4 mb-2 p-4 rounded-xl ${isExpired ? 'bg-gray-100' : 'bg-white'} shadow-sm`}>
              <View className="flex-row items-center justify-between">
                <Pressable onPress={() => copyCode(item.code)} className="flex-row items-center flex-1">
                  <Text className={`text-lg font-mono font-bold ${isExpired ? 'text-gray-400' : 'text-[#7B003F]'}`}>
                    {item.code}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={isExpired ? '#999' : '#7B003F'} style={{ marginLeft: 8 }} />
                </Pressable>
                <View className="flex-row items-center gap-3">
                  {!isExpired && (
                    <Pressable onPress={() => setQrInvitation(item)} hitSlop={8}>
                      <Ionicons name="qr-code-outline" size={18} color="#7B003F" />
                    </Pressable>
                  )}
                  {!isExpired && user?.role === 'admin' && (
                    <Pressable onPress={() => handleRevoke(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </Pressable>
                  )}
                </View>
              </View>
              <View className="flex-row mt-2 gap-3">
                <View className="flex-row items-center">
                  <Ionicons name="person" size={14} color="#666" />
                  <Text className="text-xs text-gray-500 ml-1">{roleLabel(item.role)}</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="repeat" size={14} color="#666" />
                  <Text className="text-xs text-gray-500 ml-1">
                    {item.useCount}/{item.maxUses}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="time" size={14} color="#666" />
                  <Text className="text-xs text-gray-500 ml-1">{formatDate(item.expiresAt)}</Text>
                </View>
              </View>
              {isExpired && (
                <View className="mt-2 bg-red-50 rounded-lg px-2 py-1 self-start">
                  <Text className="text-xs text-red-600">
                    {item.fullyUsed
                      ? t('admin.fullyUsed', 'Išnaudotas')
                      : t('admin.expired', 'Pasibaigęs')}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Ionicons name="ticket-outline" size={48} color="#ccc" />
            <Text className="text-gray-400 mt-3">{t('admin.noCodes', 'Kvietimo kodų nėra')}</Text>
          </View>
        }
      />

      {/* QR Code Modal */}
      <Modal
        visible={!!qrInvitation}
        animationType="fade"
        transparent
        onRequestClose={() => setQrInvitation(null)}
      >
        <Pressable
          className="flex-1 bg-black/60 items-center justify-center"
          onPress={() => setQrInvitation(null)}
        >
          <Pressable
            className="bg-white rounded-2xl mx-6 p-6 items-center w-[85%] max-w-[360px]"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-gray-900 mb-1">
              {t('admin.qrTitle', 'Kvietimo QR kodas')}
            </Text>
            <Text className="text-sm text-gray-500 mb-5 text-center">
              {t('admin.qrHint', 'Leiskite studentui nuskenuoti šį kodą registracijai')}
            </Text>

            {qrInvitation && (
              <View className="bg-white p-4 rounded-xl border border-gray-100">
                <QRCode
                  value={`knfapp://register?code=${qrInvitation.code}`}
                  size={200}
                  color="#7B003F"
                  backgroundColor="white"
                />
              </View>
            )}

            <Text className="text-base font-mono font-bold text-[#7B003F] mt-4">
              {qrInvitation?.code}
            </Text>

            {qrInvitation && (
              <View className="flex-row items-center mt-2 gap-2">
                <View className="bg-gray-100 rounded-full px-3 py-1">
                  <Text className="text-xs text-gray-600">{roleLabel(qrInvitation.role)}</Text>
                </View>
                <View className="bg-gray-100 rounded-full px-3 py-1">
                  <Text className="text-xs text-gray-600">
                    {qrInvitation.useCount}/{qrInvitation.maxUses}
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row mt-5 gap-3">
              <Pressable
                className="flex-row items-center bg-gray-100 rounded-xl px-4 py-2.5"
                onPress={() => {
                  if (qrInvitation) copyCode(qrInvitation.code);
                }}
              >
                <Ionicons name="copy-outline" size={16} color="#666" />
                <Text className="text-sm text-gray-700 ml-1.5">{t('admin.codeCopied', 'Kopijuoti')}</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center bg-[#7B003F] rounded-xl px-4 py-2.5"
                onPress={() => setQrInvitation(null)}
              >
                <Text className="text-sm text-white font-medium">{t('admin.qrClose', 'Uždaryti')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <View className="bg-white rounded-xl p-3 shadow-sm flex-1 min-w-[45%]">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon as any} size={18} color="#7B003F" />
        <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      </View>
      <Text className="text-xs text-gray-500 mt-1">{label}</Text>
    </View>
  );
}
