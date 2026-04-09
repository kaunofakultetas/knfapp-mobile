import Header from '@/components/ui/Header';
import { fetchSchedule, fetchScheduleFilters, ScheduleLesson } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
      try {
        const resp = await fetchSchedule(day, group ?? undefined, semester ?? undefined);
        setLessons(resp.lessons);
      } catch {
        setLessons([]);
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
    <View className="flex-1 bg-white">
      <Header
        title={t('schedule.title')}
        right={
          <View className="flex-row items-center">
            <Pressable onPress={() => changeDay(-1)} hitSlop={8}>
              <Text className="text-white text-xl px-2">‹</Text>
            </Pressable>
            <Text className="text-white text-base font-bold mx-1">
              {dayNames[selectedDay]}
            </Text>
            <Pressable onPress={() => changeDay(1)} hitSlop={8}>
              <Text className="text-white text-xl px-2">›</Text>
            </Pressable>
          </View>
        }
      />

      {/* Filter bar */}
      <Pressable
        onPress={() => setFilterModalVisible(true)}
        className="flex-row items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200"
      >
        <View className="flex-row items-center flex-1">
          <Feather name="filter" size={16} color="#7B003F" />
          <Text className="text-sm text-gray-700 ml-2" numberOfLines={1}>
            {selectedGroup
              ? `${selectedGroup}${selectedSemester ? ` · ${selectedSemester}` : ''}`
              : t('schedule.allGroups')}
          </Text>
        </View>
        {activeFilterCount > 0 && (
          <View className="bg-primary rounded-full w-5 h-5 items-center justify-center ml-2">
            <Text className="text-white text-xs font-bold">{activeFilterCount}</Text>
          </View>
        )}
        <Feather name="chevron-down" size={16} color="#666" className="ml-2" />
      </Pressable>

      {/* Quick day tabs */}
      <View className="flex-row bg-gray-100 border-b border-gray-200">
        {weekdayTabs.map((day) => (
          <Pressable
            key={day}
            onPress={() => setSelectedDay(day)}
            className={`flex-1 py-2.5 items-center ${selectedDay === day ? 'border-b-2 border-primary' : ''}`}
          >
            <Text
              className={`text-sm font-bold ${selectedDay === day ? 'text-primary' : 'text-gray-500'}`}
            >
              {dayNames[day].substring(0, 3)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      ) : lessons.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Feather name="calendar" size={48} color="#ccc" />
          <Text className="text-gray-500 text-lg mt-4 text-center">
            {t('schedule.noLectures', 'Šią dieną paskaitų nėra')}
          </Text>
          {selectedGroup && (
            <Text className="text-gray-400 text-sm mt-1 text-center">
              {selectedGroup}{selectedSemester ? ` · ${selectedSemester}` : ''}
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
          renderItem={({ item }) => (
            <View className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 mr-3">
                  <Text className="text-lg font-bold text-primary">{item.title}</Text>
                  <Text className="text-sm text-gray-600 mt-1">{item.teacher}</Text>
                </View>
                <View className="bg-primary/10 rounded-lg px-3 py-1.5">
                  <Text className="text-primary font-bold text-sm">{item.room}</Text>
                </View>
              </View>
              <View className="flex-row justify-between mt-3 pt-3 border-t border-gray-200">
                <Text className="text-sm text-gray-700">
                  {item.timeStart} – {item.timeEnd}
                </Text>
                <Text className="text-xs text-gray-400">{item.group} · {item.semester}</Text>
              </View>
            </View>
          )}
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
              <Text className="text-xl font-bold text-gray-900">{t('schedule.filterTitle')}</Text>
            </View>

            <ScrollView className="max-h-96 px-5">
              {/* Group selector */}
              <Text className="text-sm font-bold text-gray-500 uppercase mt-4 mb-2">
                {t('schedule.groupLabel')}
              </Text>
              <Pressable
                onPress={() => setSelectedGroup(null)}
                className={`py-3 px-4 rounded-lg mb-1 ${selectedGroup === null ? 'bg-primary/10' : ''}`}
              >
                <Text className={`text-base ${selectedGroup === null ? 'text-primary font-bold' : 'text-gray-700'}`}>
                  {t('schedule.allGroups')}
                </Text>
              </Pressable>
              {groups.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setSelectedGroup(g)}
                  className={`py-3 px-4 rounded-lg mb-1 ${selectedGroup === g ? 'bg-primary/10' : ''}`}
                >
                  <Text className={`text-base ${selectedGroup === g ? 'text-primary font-bold' : 'text-gray-700'}`}>
                    {g}
                  </Text>
                </Pressable>
              ))}

              {/* Semester selector */}
              <Text className="text-sm font-bold text-gray-500 uppercase mt-6 mb-2">
                {t('schedule.semesterLabel')}
              </Text>
              <Pressable
                onPress={() => setSelectedSemester(null)}
                className={`py-3 px-4 rounded-lg mb-1 ${selectedSemester === null ? 'bg-primary/10' : ''}`}
              >
                <Text className={`text-base ${selectedSemester === null ? 'text-primary font-bold' : 'text-gray-700'}`}>
                  {t('schedule.allSemesters')}
                </Text>
              </Pressable>
              {semesters.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSelectedSemester(s)}
                  className={`py-3 px-4 rounded-lg mb-1 ${selectedSemester === s ? 'bg-primary/10' : ''}`}
                >
                  <Text className={`text-base ${selectedSemester === s ? 'text-primary font-bold' : 'text-gray-700'}`}>
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
                className="flex-1 py-3 rounded-xl border border-gray-300 items-center"
              >
                <Text className="text-gray-700 font-bold">{t('schedule.clearFilters')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterModalVisible(false)}
                className="flex-1 py-3 rounded-xl bg-primary items-center"
              >
                <Text className="text-white font-bold">{t('schedule.applyFilters')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
