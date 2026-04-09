import Header from '@/components/ui/Header';
import { fetchSchedule, ScheduleLesson } from '@/services/api';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

const DAY_NAMES_LT = ['Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis', 'Sekmadienis'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Convert JS Date.getDay() (0=Sun) to our API format (0=Mon). */
function jsDayToApi(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export default function ScheduleScreen() {
  const { t, i18n } = useTranslation();
  const dayNames = i18n.language === 'lt' ? DAY_NAMES_LT : DAY_NAMES_EN;

  // Start on today's day-of-week
  const todayApi = jsDayToApi(new Date().getDay());
  const [selectedDay, setSelectedDay] = useState(todayApi);
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLessons = useCallback(async (day: number) => {
    try {
      const resp = await fetchSchedule(day);
      setLessons(resp.lessons);
    } catch {
      setLessons([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLessons(selectedDay);
      setLoading(false);
    })();
  }, [selectedDay, loadLessons]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLessons(selectedDay);
    setRefreshing(false);
  }, [selectedDay, loadLessons]);

  const changeDay = (delta: number) => {
    setSelectedDay((prev) => {
      const next = prev + delta;
      if (next < 0) return 6;
      if (next > 6) return 0;
      return next;
    });
  };

  // Weekday selector tabs (Mon-Fri shown, Sat/Sun accessible via arrows)
  const weekdayTabs = useMemo(() => [0, 1, 2, 3, 4], []);

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
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500 text-lg">
            {t('schedule.noLectures', 'Šią dieną paskaitų nėra')}
          </Text>
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
    </View>
  );
}
