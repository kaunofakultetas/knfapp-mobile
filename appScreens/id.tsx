import Header from '@/components/ui/Header';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { updateProfile } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const ROLE_LABELS: Record<string, { lt: string; en: string }> = {
  student: { lt: 'Studentas', en: 'Student' },
  teacher: { lt: 'D\u0117stytojas', en: 'Teacher' },
  admin: { lt: 'Administratorius', en: 'Administrator' },
  curator: { lt: 'Kuratorius', en: 'Curator' },
};

const ID_CACHE_KEY = 'student_id_cache';

export default function StudentIdTab() {
  const { user, isAuthenticated, setUser } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language as 'lt' | 'en';

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNumber, setEditNumber] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editProgram, setEditProgram] = useState('');

  // Cache student ID data for offline access
  useEffect(() => {
    if (user) {
      AsyncStorage.setItem(ID_CACHE_KEY, JSON.stringify({
        displayName: user.displayName,
        email: user.email,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl,
        studentNumber: user.studentNumber,
        studyGroup: user.studyGroup,
        studyProgram: user.studyProgram,
        cachedAt: Date.now(),
      })).catch(() => {});
    }
  }, [user]);

  const startEditing = useCallback(() => {
    setEditNumber(user?.studentNumber || '');
    setEditGroup(user?.studyGroup || '');
    setEditProgram(user?.studyProgram || '');
    setEditing(true);
  }, [user]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const saveFields = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updated = await updateProfile({
        student_number: editNumber.trim() || null,
        study_group: editGroup.trim() || null,
        study_program: editProgram.trim() || null,
      });
      setUser({ ...user, ...updated });
      setEditing(false);
      showToast('success', t('id.saved'));
    } catch {
      showToast('error', 'Error saving');
    } finally {
      setSaving(false);
    }
  }, [user, editNumber, editGroup, editProgram, setUser, t]);

  if (!isAuthenticated || !user) {
    return (
      <View className="flex-1 bg-background-secondary">
        <Header title={t('id.title')} />
        <View className="flex-1 items-center justify-center px-lg">
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center mb-lg">
            <Ionicons name="id-card-outline" size={44} color="#7B003F" />
          </View>
          <Text className="text-xl font-raleway-bold text-text-primary mb-sm text-center">
            {t('id.loginRequired')}
          </Text>
          <Text className="text-sm text-text-secondary mb-xl text-center font-raleway leading-5 px-lg">
            {t('id.loginHint')}
          </Text>
          <Pressable
            className="bg-primary py-4 rounded-xl w-full max-w-[220px] items-center"
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/login')}
          >
            <Text className="text-white font-raleway-bold text-base">{t('settings.login')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const roleLabel = ROLE_LABELS[user.role]?.[lang] || user.role;
  const payload = JSON.stringify({
    id: user.id,
    name: user.displayName,
    email: user.email,
    role: user.role,
    faculty: 'VU KNF',
    studentNumber: user.studentNumber || undefined,
    studyGroup: user.studyGroup || undefined,
  });

  return (
    <View className="flex-1 bg-background-secondary">
      <Header
        title={t('id.title')}
        right={
          !editing ? (
            <Pressable onPress={startEditing} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color="white" />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
        {/* Card */}
        <View
          className="w-full max-w-sm bg-white rounded-2xl overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          {/* Card header */}
          <View className="bg-primary px-5 py-4">
            <Text className="text-white text-xs tracking-widest uppercase font-raleway-medium">
              {t('id.university')}
            </Text>
            <Text className="text-white text-lg font-raleway-bold">
              {t('id.faculty')}
            </Text>
          </View>

          {/* Photo + name row */}
          <View className="flex-row items-center px-5 pt-5 pb-3">
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                className="w-16 h-16 rounded-full bg-gray-200"
              />
            ) : (
              <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
                <Ionicons name="person" size={28} color="#7B003F" />
              </View>
            )}
            <View className="flex-1 ml-4">
              <Text className="text-lg font-raleway-bold text-text-primary" numberOfLines={1}>
                {user.displayName}
              </Text>
              <View className="flex-row items-center mt-1">
                <View className="bg-primary/10 rounded-md px-2.5 py-0.5">
                  <Text className="text-sm text-primary font-raleway-bold">{roleLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Student info fields */}
          {editing ? (
            <View className="px-5 pb-2">
              <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mt-3 mb-1.5">
                {t('id.studentNumber')}
              </Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-base font-raleway text-text-primary"
                value={editNumber}
                onChangeText={setEditNumber}
                placeholder="e.g. 20261234"
                maxLength={50}
                autoCapitalize="characters"
              />

              <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mt-3 mb-1.5">
                {t('id.studyGroup')}
              </Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-base font-raleway text-text-primary"
                value={editGroup}
                onChangeText={setEditGroup}
                placeholder="e.g. ISKS-1"
                maxLength={50}
              />

              <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mt-3 mb-1.5">
                {t('id.studyProgram')}
              </Text>
              <TextInput
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-base font-raleway text-text-primary"
                value={editProgram}
                onChangeText={setEditProgram}
                placeholder="e.g. Informacijos sistemos"
                maxLength={50}
              />

              <View className="flex-row gap-3 mt-4 mb-2">
                <Pressable
                  onPress={cancelEditing}
                  className="flex-1 py-3 rounded-xl border border-gray-200 items-center"
                  style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                >
                  <Text className="text-text-primary font-raleway-bold">{t('id.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={saveFields}
                  className="flex-1 py-3 rounded-xl bg-primary items-center"
                  style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-raleway-bold">{t('id.save')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="px-5 pb-2">
              {/* Student number */}
              <View className="flex-row justify-between items-center py-3 border-t border-gray-100">
                <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest">
                  {t('id.studentNumber')}
                </Text>
                <Text className="text-base font-raleway-bold text-text-primary">
                  {user.studentNumber || t('id.noNumber')}
                </Text>
              </View>

              {/* Study group */}
              <View className="flex-row justify-between items-center py-3 border-t border-gray-100">
                <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest">
                  {t('id.studyGroup')}
                </Text>
                <Text className="text-base font-raleway text-text-primary">
                  {user.studyGroup || t('id.noGroup')}
                </Text>
              </View>

              {/* Study program */}
              <View className="flex-row justify-between items-center py-3 border-t border-gray-100">
                <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest">
                  {t('id.studyProgram')}
                </Text>
                <Text className="text-base font-raleway text-text-primary" style={{ maxWidth: '60%', textAlign: 'right' }}>
                  {user.studyProgram || t('id.noProgram')}
                </Text>
              </View>
            </View>
          )}

          {/* QR Code */}
          <View className="items-center py-5 border-t border-gray-100 mx-5">
            <View className="p-3 bg-white rounded-xl">
              <QRCode value={payload} size={180} />
            </View>
          </View>

          {/* Footer */}
          <View className="px-5 pb-4 border-t border-gray-100 pt-3">
            <Text className="text-xs text-text-secondary font-raleway">@{user.username}</Text>
            <Text className="text-xs text-text-secondary font-raleway mt-0.5">{user.email}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
