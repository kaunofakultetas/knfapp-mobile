import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchUserPosts,
  fetchUserProfile,
  getUploadUrl,
  sendFriendRequest,
  unfriendUser,
  updateProfile,
  uploadImageApi,
  type NewsFeedResponse,
  type UserProfile,
} from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';

const ROLE_LABELS: Record<string, { lt: string; en: string }> = {
  student: { lt: 'Studentas', en: 'Student' },
  teacher: { lt: 'Dėstytojas', en: 'Teacher' },
  admin: { lt: 'Administratorius', en: 'Administrator' },
  curator: { lt: 'Kuratorius', en: 'Curator' },
};

export default function ProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user: me, isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language as 'lt' | 'en';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<NewsFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const isOwnProfile = me?.id === userId;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [profileData, postsData] = await Promise.all([
        fetchUserProfile(userId),
        fetchUserPosts(userId, 1, 10),
      ]);
      setProfile(profileData);
      setPosts(postsData);
    } catch {
      // profile not found or error
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFriendAction = async () => {
    if (!profile || !isAuthenticated) return;
    setActionLoading(true);
    try {
      if (profile.friendshipStatus === 'friends') {
        await unfriendUser(profile.id);
        setProfile((p) => p ? { ...p, friendshipStatus: 'none', friendCount: p.friendCount - 1 } : p);
      } else if (profile.friendshipStatus === 'request_sent') {
        // Already sent, nothing to do
        showToast('info', t('profile.requestAlreadySent'));
      } else if (profile.friendshipStatus === 'request_received') {
        // Accept their request
        const requests = await fetchFriendRequests('received');
        const req = requests.requests.find(
          (r) => r.userId === profile.id
        );
        if (req) {
          await acceptFriendRequest(req.id);
          setProfile((p) => p ? { ...p, friendshipStatus: 'friends', friendCount: p.friendCount + 1 } : p);
        }
      } else {
        await sendFriendRequest(profile.id);
        setProfile((p) => p ? { ...p, friendshipStatus: 'request_sent' } : p);
      }
    } catch {
      showToast('error', t('profile.actionError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!isOwnProfile || !isAuthenticated) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      setAvatarUploading(true);
      const asset = result.assets[0];
      const upload = await uploadImageApi(asset.uri, asset.fileName ?? undefined, asset.mimeType ?? undefined);
      const fullUrl = getUploadUrl(upload.url);
      await updateProfile({ avatar_url: fullUrl });
      setProfile((p) => p ? { ...p, avatarUrl: fullUrl } : p);
      showToast('success', t('profile.avatarUpdated', 'Nuotrauka atnaujinta'));
    } catch {
      showToast('error', t('profile.avatarError', 'Nepavyko atnaujinti nuotraukos'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const friendButtonLabel = () => {
    if (!profile) return '';
    switch (profile.friendshipStatus) {
      case 'friends':
        return t('profile.unfriend');
      case 'request_sent':
        return t('profile.requestSent');
      case 'request_received':
        return t('profile.acceptRequest');
      default:
        return t('profile.addFriend');
    }
  };

  const friendButtonStyle = () => {
    if (!profile) return 'bg-[#7B003F]';
    switch (profile.friendshipStatus) {
      case 'friends':
        return 'bg-gray-200';
      case 'request_sent':
        return 'bg-gray-300';
      case 'request_received':
        return 'bg-green-600';
      default:
        return 'bg-[#7B003F]';
    }
  };

  const friendTextStyle = () => {
    if (!profile) return 'text-white';
    if (profile.friendshipStatus === 'friends' || profile.friendshipStatus === 'request_sent') {
      return 'text-gray-700';
    }
    return 'text-white';
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-500">{t('profile.notFound')}</Text>
      </View>
    );
  }

  const roleLabel = ROLE_LABELS[profile.role]?.[lang] || profile.role;

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={posts?.posts || []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View className="items-center pt-8 pb-4 px-5">
            {/* Avatar */}
            <Pressable
              onPress={isOwnProfile ? handleAvatarUpload : undefined}
              disabled={avatarUploading}
              className="mb-3"
            >
              {profile.avatarUrl ? (
                <Image
                  source={{ uri: getUploadUrl(profile.avatarUrl) }}
                  className="w-20 h-20 rounded-full"
                />
              ) : (
                <View className="w-20 h-20 rounded-full bg-[#7B003F] items-center justify-center">
                  <Text className="text-3xl text-white font-bold">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {isOwnProfile && (
                <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white items-center justify-center shadow-sm border border-gray-200">
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color="#7B003F" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#7B003F" />
                  )}
                </View>
              )}
            </Pressable>

            <Text className="text-xl font-bold text-gray-900">
              {profile.displayName}
            </Text>
            <Text className="text-sm text-[#7B003F] font-medium">
              {roleLabel}
            </Text>
            <Text className="text-xs text-gray-500 mt-1">
              @{profile.username}
            </Text>

            {/* Stats */}
            <View className="flex-row mt-5 mb-4">
              <View className="items-center px-6">
                <Text className="text-lg font-bold text-gray-900">
                  {profile.postCount}
                </Text>
                <Text className="text-xs text-gray-500">
                  {t('profile.posts')}
                </Text>
              </View>
              <View className="w-px bg-gray-200" />
              <Pressable
                className="items-center px-6"
                onPress={() => {
                  if (isOwnProfile) {
                    router.push('/(main)/friends');
                  }
                }}
              >
                <Text className="text-lg font-bold text-gray-900">
                  {profile.friendCount}
                </Text>
                <Text className="text-xs text-gray-500">
                  {t('profile.friends')}
                </Text>
              </Pressable>
            </View>

            {/* Friend action button */}
            {isAuthenticated && !isOwnProfile && (
              <View className="flex-row gap-3 mb-4">
                <Pressable
                  className={`px-6 py-2.5 rounded-xl ${friendButtonStyle()}`}
                  onPress={handleFriendAction}
                  disabled={actionLoading || profile.friendshipStatus === 'request_sent'}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#7B003F" />
                  ) : (
                    <Text className={`font-semibold ${friendTextStyle()}`}>
                      {friendButtonLabel()}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  className="px-4 py-2.5 rounded-xl bg-gray-100"
                  onPress={() =>
                    router.push({
                      pathname: '/(main)/new-chat',
                      params: { prefillUserId: profile.id },
                    })
                  }
                >
                  <Ionicons name="chatbubble-outline" size={20} color="#333" />
                </Pressable>
              </View>
            )}

            {/* Posts header */}
            {(posts?.total ?? 0) > 0 && (
              <View className="w-full border-t border-gray-100 pt-3 mt-1">
                <Text className="text-sm font-semibold text-gray-700">
                  {t('profile.recentPosts')}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            className="mx-4 mb-3 p-4 bg-gray-50 rounded-xl"
            onPress={() =>
              router.push({
                pathname: '/(main)/news-post',
                params: { postId: item.id },
              })
            }
          >
            {item.title && (
              <Text className="font-semibold text-gray-900 mb-1" numberOfLines={1}>
                {item.title}
              </Text>
            )}
            <Text className="text-sm text-gray-600" numberOfLines={3}>
              {item.content || item.summary}
            </Text>
            <View className="flex-row mt-2 gap-4">
              <View className="flex-row items-center gap-1">
                <Ionicons name="heart-outline" size={14} color="#999" />
                <Text className="text-xs text-gray-500">{item.likes}</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons name="chatbubble-outline" size={14} color="#999" />
                <Text className="text-xs text-gray-500">{item.comments}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-8">
              <Text className="text-gray-400">{t('profile.noPosts')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
