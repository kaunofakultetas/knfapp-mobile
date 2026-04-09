import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  rejectFriendRequest,
  type FriendRequest,
} from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

export default function FriendRequestsScreen() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetchFriendRequests('received');
      setRequests(res.requests);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await acceptFriendRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      showToast('error', t('friendRequests.acceptError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await rejectFriendRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      showToast('error', t('friendRequests.rejectError'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const isProcessing = actionLoading === item.id;
          return (
            <View className="flex-row items-center py-3 border-b border-gray-100">
              <Pressable
                className="flex-row items-center flex-1"
                onPress={() =>
                  router.push({
                    pathname: '/(main)/profile',
                    params: { userId: item.userId },
                  })
                }
              >
                <View className="w-12 h-12 rounded-full bg-[#7B003F] items-center justify-center">
                  <Text className="text-lg text-white font-bold">
                    {item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-gray-900">
                    {item.displayName}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    @{item.username}
                  </Text>
                </View>
              </Pressable>

              <View className="flex-row gap-2">
                <Pressable
                  className="px-4 py-2 rounded-xl bg-[#7B003F]"
                  onPress={() => handleAccept(item.id)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-semibold text-sm">
                      {t('friendRequests.accept')}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  className="px-4 py-2 rounded-xl bg-gray-200"
                  onPress={() => handleReject(item.id)}
                  disabled={isProcessing}
                >
                  <Text className="text-gray-700 font-semibold text-sm">
                    {t('friendRequests.reject')}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="checkmark-circle-outline" size={48} color="#ddd" />
            <Text className="text-gray-400 mt-3">
              {t('friendRequests.empty')}
            </Text>
          </View>
        }
      />
    </View>
  );
}
