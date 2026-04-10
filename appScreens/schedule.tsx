import CachedBanner from '@/components/CachedBanner';
import { decodeHtmlEntities } from '@/services/htmlDecode';
import Header from '@/components/ui/Header';
import { fetchSchedule, fetchScheduleFilters, ScheduleLesson, ScheduleResponse } from '@/services/api';
import { cacheGet, cacheKeySchedule, cacheSet, SCHEDULE_CACHE_MAX_AGE } from '@/services/cache';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { useScheduleConflicts } from './schedule/useScheduleConflicts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

const DAY_NAMES_LT = ['Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis', 'Sekmadienis'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SCHEDULE_PREFS_KEY = 'schedule_prefs';

/** Convert JS Date.getDay() (0=Sun) to our API format (0=Mon). */
function jsDayToApi(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

interface SchedulePrefs {
  group: string | null;
  semester: string | null;
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const dayNames = i18n.language === 'lt' ? DAY_NAMES_LT : DAY_NAMES_EN;

  const todayApi = jsDayToApi(new Date().getDay());
  const [selectedDay, setSelectedDay] = useState(todayApi);
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [groups, setGroups] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  // Detect time conflicts among displayed lessons
  const conflictIds = useScheduleConflicts(lessons);

  // Load persisted preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SCHEDULE_PREFS_KEY);
        if (raw) {
          const prefs: SchedulePrefs = JSON.parse(raw);
          if (prefs.group) setSelectedGroup(prefs.group);
          if (prefs.semester) setSelectedSemester(prefs.semester);
        }
      } catch {
        // ignore
      }
      setFiltersLoaded(true);
    })();
  }, []);

  // Load available filters
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetchScheduleFilters();
        setGroups(resp.groups);
        setSemesters(resp.semesters);
      } catch {
        // silently fail — filters just won't be populated
      }
    })();
  }, []);

  // Persist preferences when they change
  useEffect(() => {
    if (!filtersLoaded) return;
    const prefs: SchedulePrefs = { group: selectedGroup, semester: selectedSemester };
    AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [selectedGroup, selectedSemester, filtersLoaded]);

  const loadLessons = useCallback(
    async (day: number, group: string | null, semester: string | null) => {
      const key = cacheKeySchedule(day, group, semester);
      try {
        const resp = await fetchSchedule(day, group ?? undefined, semester ?? undefined);
        setLessons(resp.lessons);
        setCachedAt(null);
        cacheSet(key, resp);
      } catch {
        // Try offline cache
        const cached = await cacheGet<ScheduleResponse>(key, SCHEDULE_CACHE_MAX_AGE);
        if (cached) {
          setLessons(cached.data.lessons);
          setCachedAt(cached.cachedAt);
        } else {
          setLessons([]);
          setCachedAt(null);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!filtersLoaded) return;
    (async () => {
      setLoading(true);
      await loadLessons(selectedDay, selectedGroup, selectedSemester);
      setLoading(false);
    })();
  }, [selectedDay, selectedGroup, selectedSemester, filtersLoaded, loadLessons]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLessons(selectedDay, selectedGroup, selectedSemester);
    setRefreshing(false);
  }, [selectedDay, selectedGroup, selectedSemester, loadLessons]);

  // Auto-refresh when network is restored -- use refs to avoid stale closures
  const dayRef = useRef(selectedDay);
  const groupRef = useRef(selectedGroup);
  const semesterRef = useRef(selectedSemester);
  dayRef.current = selectedDay;
  groupRef.current = selectedGroup;
  semesterRef.current = selectedSemester;

  useNetworkRestore(useCallback(() => {
    loadLessons(dayRef.current, groupRef.current, semesterRef.current);
  }, [loadLessons]));

  const changeDay = (delta: number) => {
    setSelectedDay((prev) => {
      const next = prev + delta;
      if (next < 0) return 6;
      if (next > 6) return 0;
      return next;
    });
  };

  const weekdayTabs = useMemo(() => [0, 1, 2, 3, 4], []);

  const activeFilterCount = (selectedGroup ? 1 : 0) + (selectedSemester ? 1 : 0);

  return (
    <View className="flex-1 bg-background-secondary">
      <Header
        title={t('schedule.title')}
        right={
          <View className="flex-row items-center">
            <Pressable onPress={() => changeDay(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="white" />
            </Pressable>
            <Text className="text-white text-base font-raleway-bold mx-2">
              {dayNames[selectedDay]}
            </Text>
            <Pressable onPress={() => changeDay(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color="white" />
            </Pressable>
          </View>
        }
      />

      {/* Filter bar */}
      <Pressable
        onPress={() => setFilterModalVisible(true)}
        className="flex-row items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100"
        style={({ pressed }) => [pressed && { backgroundColor: '#F5F5F5' }]}
      >
        <View className="flex-row items-center flex-1">
          <Ionicons name="filter-outline" size={16} color="#7B003F" />
          <Text className="text-sm text-text-primary font-raleway-medium ml-2" numberOfLines={1}>
            {selectedGroup
              ? `${selectedGroup}${selectedSemester ? ` · ${selectedSemester}` : ''}`
              : t('schedule.allGroups')}
          </Text>
        </View>
        {activeFilterCount > 0 && (
          <View className="bg-primary rounded-full w-5 h-5 items-center justify-center ml-2">
            <Text className="text-white text-xs font-raleway-bold">{activeFilterCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-down" size={16} color="#9E9E9E" style={{ marginLeft: 8 }} />
      </Pressable>

      {/* Quick day tabs */}
      <View className="flex-row bg-white border-b border-gray-100">
        {weekdayTabs.map((day) => (
          <Pressable
            key={day}
            onPress={() => setSelectedDay(day)}
            className="flex-1 items-center"
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View className={`py-3 items-center border-b-2 ${selectedDay === day ? 'border-primary' : 'border-transparent'}`}>
              <Text
                className={`text-sm font-raleway-bold ${selectedDay === day ? 'text-primary' : 'text-text-secondary'}`}
              >
                {dayNames[day].substring(0, 3)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {cachedAt && <CachedBanner cachedAt={cachedAt} />}
      {!loading && conflictIds.size > 0 && (
        <View className="mx-4 mt-3 flex-row items-center bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <Ionicons name="alert-circle" size={16} color="#dc2626" />
          <Text className="text-xs text-red-700 font-raleway-medium ml-2 flex-1">
            {t('schedule.conflictBanner', {
              count: conflictIds.size,
              defaultValue: '{{count}} pamokos persidengia laiku',
            })}
          </Text>
        </View>
      )}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      ) : lessons.length === 0 ? (
        <View className="flex-1 items-center justify-center px-lg">
          <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-md">
            <Ionicons name="calendar-outline" size={36} color="#BDBDBD" />
          </View>
          <Text className="text-text-secondary text-base mt-sm text-center font-raleway-medium">
            {t('schedule.noLectures', 'Šią dieną paskaitų nėra')}
          </Text>
          {selectedGroup && (
            <Text className="text-text-secondary text-sm mt-2 text-center font-raleway">
              {selectedGroup}{selectedSemester ? ` \u00B7 ${selectedSemester}` : ''}
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 16 }}
          data={lessons}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B003F" colors={['#7B003F']} />
          }
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => {
            const hasConflict = conflictIds.has(item.id);
            return (
              <View className={`rounded-xl overflow-hidden ${hasConflict ? 'bg-red-50' : 'bg-white'}`} style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
                <View className="flex-row">
                  <View className={`w-1 rounded-l-xl ${hasConflict ? 'bg-red-500' : 'bg-primary'}`} />
                  <View className="flex-1 p-4">
                    {hasConflict && (
                      <View className="flex-row items-center mb-2 bg-red-100 rounded-lg px-2.5 py-1.5 self-start">
                        <Ionicons name="alert-circle" size={14} color="#dc2626" />
                        <Text className="text-xs text-red-700 font-raleway-bold ml-1.5">
                          {t('schedule.conflict', 'Persidengimas')}
                        </Text>
                      </View>
                    )}
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 mr-3">
                        <Text className="text-base font-raleway-bold text-text-primary leading-6" numberOfLines={2}>{decodeHtmlEntities(item.title)}</Text>
                        <Text className="text-sm text-text-secondary font-raleway mt-1.5" numberOfLines={1}>{item.teacher}</Text>
                      </View>
                      <View className="bg-primary/10 rounded-lg px-3.5 py-2" style={{ maxWidth: 130 }}>
                        <Text className="text-primary font-raleway-bold text-xs" numberOfLines={1}>{item.room}</Text>
                      </View>
                    </View>
                    <View className={`flex-row justify-between items-center mt-3.5 pt-3 border-t ${hasConflict ? 'border-red-200' : 'border-gray-100'}`}>
                      <View className="flex-row items-center gap-2">
                        <Ionicons name="time-outline" size={14} color={hasConflict ? '#dc2626' : '#7B003F'} />
                        <Text className={`text-sm font-raleway-bold ${hasConflict ? 'text-red-600' : 'text-primary'}`}>
                          {item.timeStart} {'\u2013'} {item.timeEnd}
                        </Text>
                      </View>
                      <Text className="text-xs text-text-secondary font-raleway">{item.group} {'\u00B7'} {item.semester}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Filter modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setFilterModalVisible(false)}
        >
          <Pressable className="bg-white rounded-t-2xl" onPress={() => {}}>
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-gray-300 rounded-full" />
            </View>

            <View className="px-5 pt-4 pb-2">
              <Text className="text-xl font-raleway-bold text-text-primary">{t('schedule.filterTitle')}</Text>
            </View>

            <ScrollView className="max-h-96 px-5">
              {/* Group selector */}
              <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mt-4 mb-2">
                {t('schedule.groupLabel')}
              </Text>
              <Pressable
                onPress={() => setSelectedGroup(null)}
                className={`py-3 px-4 rounded-lg mb-1 ${selectedGroup === null ? 'bg-primary/10' : ''}`}
              >
                <Text className={`text-base font-raleway ${selectedGroup === null ? 'text-primary font-raleway-bold' : 'text-text-primary'}`}>
                  {t('schedule.allGroups')}
                </Text>
              </Pressable>
              {groups.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setSelectedGroup(g)}
                  className={`py-3 px-4 rounded-lg mb-1 ${selectedGroup === g ? 'bg-primary/10' : ''}`}
                >
                  <Text className={`text-base font-raleway ${selectedGroup === g ? 'text-primary font-raleway-bold' : 'text-text-primary'}`}>
                    {g}
                  </Text>
                </Pressable>
              ))}

              {/* Semester selector */}
              <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mt-6 mb-2">
                {t('schedule.semesterLabel')}
              </Text>
              <Pressable
                onPress={() => setSelectedSemester(null)}
                className={`py-3 px-4 rounded-lg mb-1 ${selectedSemester === null ? 'bg-primary/10' : ''}`}
              >
                <Text className={`text-base font-raleway ${selectedSemester === null ? 'text-primary font-raleway-bold' : 'text-text-primary'}`}>
                  {t('schedule.allSemesters')}
                </Text>
              </Pressable>
              {semesters.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSelectedSemester(s)}
                  className={`py-3 px-4 rounded-lg mb-1 ${selectedSemester === s ? 'bg-primary/10' : ''}`}
                >
                  <Text className={`text-base font-raleway ${selectedSemester === s ? 'text-primary font-raleway-bold' : 'text-text-primary'}`}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Actions */}
            <View className="flex-row px-5 pt-4 pb-8 gap-3">
              <Pressable
                onPress={() => {
                  setSelectedGroup(null);
                  setSelectedSemester(null);
                }}
                className="flex-1 py-3.5 rounded-xl border border-gray-200 items-center"
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Text className="text-text-primary font-raleway-bold">{t('schedule.clearFilters')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterModalVisible(false)}
                className="flex-1 py-3.5 rounded-xl bg-primary items-center"
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Text className="text-white font-raleway-bold">{t('schedule.applyFilters')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
