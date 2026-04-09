import CachedBanner from '@/components/CachedBanner';
import { useApp } from '@/context/AppContext';
import {
  fetchFacultyInfo,
  type FacultyInfoResponse,
  type InfoContactCategory,
  type InfoFaq,
  type InfoHours,
  type InfoLink,
  type InfoProgram,
} from '@/services/api';
import { cacheGet, cacheKeyInfo, cacheSet, INFO_CACHE_MAX_AGE } from '@/services/cache';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

// ── Icon mapping ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  globe: 'globe-outline',
  school: 'school-outline',
  laptop: 'laptop-outline',
  mail: 'mail-outline',
  book: 'book-outline',
  library: 'library-outline',
  'share-social': 'logo-facebook',
  'document-text': 'document-text-outline',
};

// ── Section components ──────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="flex-row items-center gap-2 mb-3 mt-5">
      <Ionicons name={icon} size={22} color="#7B003F" />
      <Text className="text-lg font-bold text-primary">{title}</Text>
    </View>
  );
}

function ContactsSection({ contacts }: { contacts: InfoContactCategory[] }) {
  return (
    <>
      {contacts.map((cat) => (
        <View key={cat.category} className="mb-4">
          <Text className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2">{cat.category}</Text>
          {cat.items.map((c) => (
            <View key={c.name} className="bg-gray-50 rounded-lg p-3 mb-2">
              <Text className="text-base font-semibold">{c.name}</Text>
              {c.room && (
                <View className="flex-row items-center gap-1 mt-1">
                  <Ionicons name="location-outline" size={14} color="#666" />
                  <Text className="text-sm text-gray-600">{c.room}</Text>
                </View>
              )}
              {c.phone && (
                <Pressable className="flex-row items-center gap-1 mt-1" onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                  <Ionicons name="call-outline" size={14} color="#7B003F" />
                  <Text className="text-sm text-primary">{c.phone}</Text>
                </Pressable>
              )}
              {c.email && (
                <Pressable className="flex-row items-center gap-1 mt-1" onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                  <Ionicons name="mail-outline" size={14} color="#7B003F" />
                  <Text className="text-sm text-primary">{c.email}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function LinksSection({ links }: { links: InfoLink[] }) {
  return (
    <View className="gap-2">
      {links.map((link) => (
        <Pressable
          key={link.url}
          className="flex-row items-center bg-gray-50 rounded-lg p-3 gap-3"
          onPress={() => Linking.openURL(link.url)}
        >
          <Ionicons name={ICON_MAP[link.icon] || 'link-outline'} size={22} color="#7B003F" />
          <Text className="text-base text-primary flex-1">{link.title}</Text>
          <Ionicons name="open-outline" size={16} color="#999" />
        </Pressable>
      ))}
    </View>
  );
}

function HoursSection({ hours }: { hours: InfoHours[] }) {
  return (
    <View className="gap-2">
      {hours.map((h) => (
        <View key={h.place} className="bg-gray-50 rounded-lg p-3">
          <Text className="text-base font-semibold">{h.place}</Text>
          <Text className="text-sm text-gray-500">{h.address}</Text>
          <View className="flex-row items-center gap-1 mt-1">
            <Ionicons name="time-outline" size={14} color="#7B003F" />
            <Text className="text-sm font-medium">{h.schedule}</Text>
          </View>
          {h.note ? <Text className="text-xs text-gray-500 mt-1">{h.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function ProgramsSection({ programs }: { programs: InfoProgram[] }) {
  return (
    <View className="gap-2">
      {programs.map((p) => (
        <View key={p.name} className="bg-gray-50 rounded-lg p-3">
          <Text className="text-base font-semibold">{p.name}</Text>
          <Text className="text-sm text-gray-500">
            {p.degree} · {p.duration}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FaqSection({ faq }: { faq: InfoFaq[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <View className="gap-2">
      {faq.map((item, idx) => (
        <Pressable
          key={idx}
          className="bg-gray-50 rounded-lg p-3"
          onPress={() => toggle(idx)}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold flex-1 pr-2">{item.q}</Text>
            <Ionicons name={expanded.has(idx) ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
          </View>
          {expanded.has(idx) && <Text className="text-sm text-gray-600 mt-2 leading-5">{item.a}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function InfoScreen() {
  const { t } = useTranslation();
  const { language } = useApp();
  const [data, setData] = useState<FacultyInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const hasLiveData = useRef(false);

  const load = useCallback(async () => {
    const key = cacheKeyInfo(language);
    try {
      const info = await fetchFacultyInfo(language);
      setData(info);
      setCachedAt(null);
      hasLiveData.current = true;
      cacheSet(key, info);
    } catch {
      // On failure: try cache only if we don't already have live data displayed
      if (!hasLiveData.current) {
        const cached = await cacheGet<FacultyInfoResponse>(key, INFO_CACHE_MAX_AGE);
        if (cached) {
          setData(cached.data);
          setCachedAt(cached.cachedAt);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Ionicons name="alert-circle-outline" size={48} color="#999" />
        <Text className="text-base text-gray-500 mt-3 text-center">{t('info.loadError')}</Text>
        <Pressable className="mt-4 bg-primary rounded-lg px-5 py-2" onPress={load}>
          <Text className="text-white font-medium">{t('common.tryAgain')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B003F" />}
    >
      {cachedAt && <CachedBanner cachedAt={cachedAt} />}

      {/* Faculty header */}
      <View className="items-center mb-2">
        <Text className="text-xl font-bold text-primary text-center">{t('info.facultyName')}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t('info.address')}</Text>
      </View>

      {/* Contacts */}
      <SectionHeader title={t('info.contacts')} icon="people-outline" />
      <ContactsSection contacts={data.contacts} />

      {/* Building hours */}
      <SectionHeader title={t('info.hours')} icon="time-outline" />
      <HoursSection hours={data.hours} />

      {/* Useful links */}
      <SectionHeader title={t('info.links')} icon="link-outline" />
      <LinksSection links={data.links} />

      {/* Study programs */}
      <SectionHeader title={t('info.programs')} icon="school-outline" />
      <ProgramsSection programs={data.programs} />

      {/* FAQ */}
      <SectionHeader title={t('info.faq')} icon="help-circle-outline" />
      <FaqSection faq={data.faq} />
    </ScrollView>
  );
}
