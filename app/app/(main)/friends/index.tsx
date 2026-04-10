import { useAuth } from '@/context/AuthContext';
import {
  fetchFriendRequests,
  fetchFriends,
  type Friend,
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

export default function FriendsScreen() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [friendsRes, requestsRes] = await Promise.all([
        fetchFriends(),
        fetchFriendRequests('received'),
      ]);
      setFriends(friendsRes.friends);
      setPendingCount(requestsRes.requests.length);
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

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-background-secondary px-6">
        <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-md">
          <Ionicons name="people-outline" size={36} color="#7B003F" />
        </View>
        <Text className="text-text-secondary mt-3 text-center font-raleway-medium">
          {t('friends.loginRequired')}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background-secondary">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-secondary">
      {/* Pending requests banner */}
      {pendingCount > 0 && (
        <Pressable
          className="mx-4 mt-4 p-4 bg-primary rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(main)/friend-requests')}
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="person-add" size={20} color="white" />
            <Text className="text-white font-raleway-bold">
              {t('friends.pendingRequests', { count: pendingCount })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="white" />
        </Pressable>
      )}

      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable
            className="flex-row items-center py-3 border-b border-gray-100"
            onPress={() =>
              router.push({
                pathname: '/(main)/profile',
                params: { userId: item.id },
              })
            }
          >
            <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
              <Text className="text-lg text-white font-raleway-bold">
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-raleway-bold text-text-primary">
                {item.displayName}
              </Text>
              <Text className="text-xs text-text-secondary font-raleway">@{item.username}</Text>
            </View>
            <Pressable
              className="px-3 py-1.5 rounded-lg bg-gray-100"
              onPress={() =>
                router.push({
                  pathname: '/(main)/new-chat',
                  params: { prefillUserId: item.id },
                })
              }
            >
              <Ionicons name="chatbubble-outline" size={16} color="#333" />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-md">
              <Ionicons name="people-outline" size={36} color="#BDBDBD" />
            </View>
            <Text className="text-text-secondary mt-3 font-raleway-medium">
              {t('friends.empty')}
            </Text>
            <Text className="text-text-secondary text-xs mt-1 text-center px-8 font-raleway">
              {t('friends.emptyHint')}
            </Text>
          </View>
        }
      />
    </View>
  );
}
