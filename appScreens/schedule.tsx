import Header from '@/components/ui/Header';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';

type Lesson = {
  id: string;
  title: string;
  teacher: string;
  room: string;
  start: string; // ISO string
  end: string;   // ISO string
};

const MOCK_SCHEDULE: Lesson[] = [
  { id: '1', title: 'Programavimo pagrindai', teacher: 'Doc. J. Kazlauskas', room: '207', start: '2025-09-01T08:30:00', end: '2025-09-01T10:00:00' },
  { id: '2', title: 'Duomenų bazės', teacher: 'Lekt. I. Petrauskaitė', room: '105', start: '2025-09-01T10:15:00', end: '2025-09-01T11:45:00' },
  { id: '3', title: 'Tinklų pagrindai', teacher: 'Asist. K. Jonaitis', room: 'Lab-3', start: '2025-09-02T12:00:00', end: '2025-09-02T13:30:00' },
  { id: '4', title: 'Diskrečioji matematika', teacher: 'Prof. V. Matulis', room: 'Aula', start: '2025-09-03T08:30:00', end: '2025-09-03T10:00:00' },
];

export default function ScheduleScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { t } = useTranslation();

  const itemsForDay = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const d = selectedDate.getDate();
    return MOCK_SCHEDULE.filter((l) => {
      const sd = new Date(l.start);
      return sd.getFullYear() === y && sd.getMonth() === m && sd.getDate() === d;
    });
  }, [selectedDate]);

  const changeDay = (delta: number) => setSelectedDate((curr) => {
    const next = new Date(curr);
    next.setDate(curr.getDate() + delta);
    return next;
  });

  return (
    <View className="flex-1 bg-white">
      <Header
        title={t('schedule.title')}
        right={
          <View className="flex-row items-center">
            <Pressable onPress={() => changeDay(-1)}><Text className="text-white text-xl">‹</Text></Pressable>
            <Text className="text-white text-lg font-raleway-bold mx-md">{selectedDate.toLocaleDateString('lt-LT')}</Text>
            <Pressable onPress={() => changeDay(1)}><Text className="text-white text-xl">›</Text></Pressable>
          </View>
        }
      />

      {itemsForDay.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-600">{t('schedule.noLectures')}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerClassName="p-lg"
          data={itemsForDay}
          keyExtractor={(i) => i.id}
          ItemSeparatorComponent={() => <View className="h-sm" />}
          renderItem={({ item }) => (
            <View className="bg-background-card rounded-lg p-md border border-gray-200">
              <Text className="text-lg font-raleway-bold text-primary">{item.title}</Text>
              <Text className="text-sm text-gray-700 mt-xs">{item.teacher}</Text>
              <View className="flex-row justify-between mt-sm">
                <Text className="text-sm">{new Date(item.start).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'})} - {new Date(item.end).toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'})}</Text>
                <Text className="text-sm">{item.room}</Text>
              </View>
              <View className="flex-row mt-sm">
                <Text className="text-xs text-gray-500">{t('schedule.typeLecture')}</Text>
                <Text className="text-xs text-gray-400 ml-md">{t('schedule.group', { group: 'ISKS-23' })}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

