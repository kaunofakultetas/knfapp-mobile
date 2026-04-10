import CachedBanner from '@/components/CachedBanner';
import { useApp } from '@/context/AppContext';
import {
  fetchFacultyInfo,
  type FacultyInfoResponse,
  type InfoContactCategory,
  type InfoFaq,
  type InfoGeneralContact,
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
    <View className="flex-row items-center gap-3 mb-3 mt-6 px-1">
      <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center">
        <Ionicons name={icon} size={20} color="#7B003F" />
      </View>
      <Text className="text-lg font-raleway-bold text-text-primary">{title}</Text>
    </View>
  );
}

function ContactsSection({ contacts }: { contacts: InfoContactCategory[] }) {
  return (
    <>
      {contacts.map((cat) => (
        <View key={cat.category} className="mb-4">
          <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2 px-1">{cat.category}</Text>
          {cat.items.map((c) => (
            <View key={c.name} className="bg-white rounded-xl p-4 mb-2" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
              <Text className="text-base font-raleway-bold text-text-primary">{c.name}</Text>
              {c.position && (
                <Text className="text-sm text-text-secondary font-raleway mt-0.5">{c.position}</Text>
              )}
              {c.room && (
                <View className="flex-row items-center gap-1.5 mt-2">
                  <Ionicons name="location-outline" size={14} color="#757575" />
                  <Text className="text-sm text-text-secondary font-raleway">{c.room}</Text>
                </View>
              )}
              {c.phone && (
                <Pressable className="flex-row items-center gap-1.5 mt-1.5" onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                  <Ionicons name="call-outline" size={14} color="#7B003F" />
                  <Text className="text-sm text-primary font-raleway-medium">{c.phone}</Text>
                </Pressable>
              )}
              {c.email && (
                <Pressable className="flex-row items-center gap-1.5 mt-1.5" onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                  <Ionicons name="mail-outline" size={14} color="#7B003F" />
                  <Text className="text-sm text-primary font-raleway-medium">{c.email}</Text>
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
          className="flex-row items-center bg-white rounded-xl p-4 gap-3"
          style={({ pressed }) => [
            { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => Linking.openURL(link.url)}
        >
          <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center">
            <Ionicons name={ICON_MAP[link.icon] || 'link-outline'} size={20} color="#7B003F" />
          </View>
          <Text className="text-base text-text-primary font-raleway-medium flex-1">{link.title}</Text>
          <Ionicons name="open-outline" size={16} color="#BDBDBD" />
        </Pressable>
      ))}
    </View>
  );
}

function HoursSection({ hours }: { hours: InfoHours[] }) {
  return (
    <View className="gap-2">
      {hours.map((h) => (
        <View key={h.place} className="bg-white rounded-xl p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
          <Text className="text-base font-raleway-bold text-text-primary">{h.place}</Text>
          <Text className="text-sm text-text-secondary font-raleway mt-0.5">{h.address}</Text>
          <View className="flex-row items-center gap-1.5 mt-2">
            <Ionicons name="time-outline" size={14} color="#7B003F" />
            <Text className="text-sm font-raleway-medium text-text-primary">{h.schedule}</Text>
          </View>
          {h.note ? <Text className="text-xs text-text-secondary font-raleway mt-1">{h.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function ProgramsSection({ programs }: { programs: InfoProgram[] }) {
  return (
    <View className="gap-2">
      {programs.map((p) => (
        <View key={p.name} className="bg-white rounded-xl p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
          <Text className="text-base font-raleway-bold text-text-primary">{p.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <View className="bg-primary/10 rounded-md px-2 py-0.5">
              <Text className="text-xs text-primary font-raleway-bold">{p.degree}</Text>
            </View>
            <Text className="text-sm text-text-secondary font-raleway">{p.duration}</Text>
          </View>
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
          className="bg-white rounded-xl p-4"
          style={({ pressed }) => [
            { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => toggle(idx)}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-raleway-bold text-text-primary flex-1 pr-2">{item.q}</Text>
            <View className="w-7 h-7 rounded-full bg-gray-100 items-center justify-center">
              <Ionicons name={expanded.has(idx) ? 'chevron-up' : 'chevron-down'} size={16} color="#757575" />
            </View>
          </View>
          {expanded.has(idx) && (
            <Text className="text-sm text-text-secondary font-raleway mt-3 pt-3 border-t border-gray-100 leading-5">{item.a}</Text>
          )}
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
      <View className="flex-1 bg-background-secondary">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-background-secondary">
        <View className="flex-1 items-center justify-center px-lg">
          <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-md">
            <Ionicons name="alert-circle-outline" size={36} color="#BDBDBD" />
          </View>
          <Text className="text-lg text-text-secondary mt-sm text-center font-raleway-medium">{t('info.loadError')}</Text>
          <Pressable
            className="mt-lg bg-primary px-xl py-3.5 rounded-xl"
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            onPress={load}
          >
            <Text className="text-white font-raleway-bold text-base">{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background-secondary"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B003F" colors={['#7B003F']} />}
    >
      {cachedAt && <CachedBanner cachedAt={cachedAt} />}

      {/* Faculty header card */}
      <View className="bg-white rounded-2xl overflow-hidden mb-2" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 }}>
        <View className="bg-primary px-5 py-4">
          <Text className="text-white text-xs tracking-widest uppercase font-raleway-medium">
            Vilniaus universitetas
          </Text>
          <Text className="text-white text-lg font-raleway-bold mt-0.5">
            {t('info.facultyName')}
          </Text>
        </View>
        <View className="px-5 py-4">
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="location-outline" size={16} color="#757575" />
            <Text className="text-sm text-text-secondary font-raleway flex-1">
              {data.general_contact?.address || t('info.address')}
            </Text>
          </View>
          {data.general_contact && (
            <View className="gap-1.5">
              {data.general_contact.phone && (
                <Pressable
                  className="flex-row items-center gap-2"
                  onPress={() => Linking.openURL(`tel:${data.general_contact!.phone}`)}
                >
                  <Ionicons name="call-outline" size={16} color="#7B003F" />
                  <Text className="text-sm text-primary font-raleway-medium">{data.general_contact.phone}</Text>
                </Pressable>
              )}
              {data.general_contact.email && (
                <Pressable
                  className="flex-row items-center gap-2"
                  onPress={() => Linking.openURL(`mailto:${data.general_contact!.email}`)}
                >
                  <Ionicons name="mail-outline" size={16} color="#7B003F" />
                  <Text className="text-sm text-primary font-raleway-medium">{data.general_contact.email}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
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
