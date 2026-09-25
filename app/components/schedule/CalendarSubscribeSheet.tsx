// -----------------------------------------------------------
//  [*] CalendarSubscribeSheet — the timetable in the phone's calendar
//
//  The sheet behind the schedule screen's calendar button:
//  one group's or one teacher's timetable as a SUBSCRIPTION
//  (GET /schedule/calendar.ics), so lectures, rooms and exams
//  land in the student's own calendar and follow every change
//  the scraper picks up. Two ways in:
//
//    - "Open in Calendar" hands the feed to the platform's
//      calendar — the webcal:// link on iOS (Apple Calendar's
//      subscribe prompt), Google Calendar's add-by-URL page on
//      Android. When nothing takes the link (no handler, a web
//      build) the https link is copied instead and the sheet
//      says so.
//    - "Copy link" puts the https link on the clipboard for
//      any other calendar, with a one-line how-to beneath.
//
//  Feedback is written INTO the sheet and announced to screen
//  readers — never toasted, since the app's toast renders
//  underneath a Modal. A copy that fails shows the link
//  itself, selectable, as the last way out. The feed speaks
//  the app's language; its host is the API base the app
//  already talks to (scheduleCalendarLinks builds all three
//  addresses). A successful open closes the sheet — the
//  calendar has taken over; a copy keeps it up with the
//  how-to in view.
//
//  Split into (root component last):
//
//    SubscribeStatus        — the outcome of the last action
//    StatusLine             — that outcome, shown in the sheet
//    CalendarSubscribeSheet — the sheet itself (default export)
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — the filter row's calendar
//      button
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { scheduleCalendarLinks, type ScheduleCalendarScope } from '@/services/api';







// -----------------------------------------------------------
// SubscribeStatus
// -----------------------------------------------------------
//
// What the last press came to: a copied link ('ok'), or a
// copy that failed ('error' — the sheet then shows the link
// to select by hand).
//
// Used by:
//   - StatusLine, CalendarSubscribeSheet (below)
// -----------------------------------------------------------

type SubscribeStatus = { tone: 'ok' | 'error'; text: string };







// -----------------------------------------------------------
// StatusLine
// -----------------------------------------------------------
//
// The outcome under the two actions — a success tick or a
// danger mark beside the sentence. Screen readers hear it
// through the sheet's announcement, once, as it is set.
//
// Used by:
//   - CalendarSubscribeSheet (below)
// -----------------------------------------------------------

function StatusLine({ status }: { status: SubscribeStatus }) {
  const { colors } = useTheme();
  const ok = status.tone === 'ok';
  return (
    <View className="mt-3 flex-row items-start" testID="calendar-subscribe-status">
      <View style={{ marginTop: 1 }}>
        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={ok ? colors.success : colors.danger} />
      </View>
      <Text className={`ml-2 flex-1 font-raleway-medium text-sm ${ok ? 'text-success' : 'text-danger'}`}>
        {status.text}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// CalendarSubscribeSheet (default export)
// -----------------------------------------------------------
//
// Visibility IS the scope prop — null closes the Modal. The
// three links are rebuilt from the scope and the app language
// on every render (string work, nothing to cache). Every way
// out — the scrim, the close button, Android's back, iOS
// VoiceOver's escape gesture (the scrim is hidden from screen
// readers), a successful open — clears the status first, so
// the next opening starts clean. expo-clipboard answers false
// instead of throwing where the platform refuses (a web page
// without clipboard rights): that counts as a failure too.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the filter row's calendar
//     button, with the applied group or teacher
// -----------------------------------------------------------

export default function CalendarSubscribeSheet({
  scope,
  onClose,
}: {
  // Null closes the sheet
  scope: ScheduleCalendarScope | null;
  onClose: () => void;
}) {

  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SubscribeStatus | null>(null);

  const links = scope ? scheduleCalendarLinks(scope, i18n.language?.startsWith('en') ? 'en' : 'lt') : null;
  const name = scope ? ('group' in scope ? scope.group : scope.teacher) : '';


  const report = (next: SubscribeStatus) => {
    setStatus(next);
    AccessibilityInfo.announceForAccessibility(next.text);
  };

  const close = () => {
    setStatus(null);
    onClose();
  };


  // The https link onto the clipboard; `done` is the sentence
  // a success reports (a plain copy, or the open's fallback)
  const copyLink = async (done: string) => {
    if (!links) return;
    try {
      const copied = await Clipboard.setStringAsync(links.url);
      if (copied === false) throw new Error('clipboard refused');
      report({ tone: 'ok', text: done });
    } catch {
      report({ tone: 'error', text: t('schedule.linkCopyFailed') });
    }
  };


  // The platform's calendar: Google's add-by-URL page on
  // Android (no system webcal handler there), the webcal://
  // link everywhere else. A refusal falls back to the copy
  const openInCalendar = async () => {
    if (!links) return;
    try {
      await Linking.openURL(Platform.OS === 'android' ? links.google : links.webcal);
      close();
    } catch {
      await copyLink(t('schedule.calendarOpenFailed'));
    }
  };


  return (
    <Modal visible={scope !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View className="flex-1 justify-end">

        <Pressable
          onPress={close}
          accessible={false}
          importantForAccessibility="no"
          className="absolute bottom-0 left-0 right-0 top-0 bg-scrim"
        />

        <View
          className="mx-md rounded-2xl bg-surface p-md"
          style={{ marginBottom: insets.bottom + 24 }}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          testID="calendar-subscribe-sheet"
        >

          <Text className="mb-1 font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
            {t('schedule.subscribeAction')}
          </Text>
          <View className="mb-2 flex-row items-center">
            <Ionicons name={scope && 'teacher' in scope ? 'person-outline' : 'people-outline'} size={18} color={colors.brand} />
            <Text className="ml-2 flex-1 font-raleway-bold text-lg leading-6 text-ink" accessibilityRole="header">
              {name}
            </Text>
          </View>
          <Text className="mb-4 font-raleway text-sm text-ink-soft">{t('schedule.subscribeLead')}</Text>

          <Button title={t('schedule.openInCalendar')} leftIcon="calendar-outline" onPress={() => void openInCalendar()} />
          <View className="mt-2">
            <Button
              title={t('schedule.copyLink')}
              variant="secondary"
              leftIcon="copy-outline"
              onPress={() => void copyLink(t('schedule.linkCopied'))}
            />
          </View>

          {status ? <StatusLine status={status} /> : null}
          {status?.tone === 'error' && links ? (
            <Text selectable className="mt-2 font-raleway text-xs text-ink" testID="calendar-subscribe-url">
              {links.url}
            </Text>
          ) : null}

          <Text className="mt-3 font-raleway text-xs text-ink-soft">{t('schedule.subscribeHowTo')}</Text>

          <View className="mt-2">
            <Button title={t('common.close')} variant="ghost" onPress={close} />
          </View>

        </View>
      </View>
    </Modal>
  );
}
