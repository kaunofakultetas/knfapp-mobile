// -----------------------------------------------------------
//  [*] Tests — the timetable as a calendar subscription
//
//  scheduleCalendarLinks builds the feed's three addresses
//  off the app's OWN API base (never a hardcoded host): the
//  https URL "copy link" hands over, its webcal:// twin, and
//  Google Calendar's add-by-URL page carrying the webcal link
//  as its cid — group or teacher exact and encoded, the
//  language riding along. The sheet then picks per platform:
//  webcal:// on iOS, Google's page on Android; an open that
//  fails copies the https link instead and says so in the
//  sheet (the app's toast would render under the Modal); a
//  copy reports in the sheet too, and a refused copy shows
//  the link to select by hand. Every way out — VoiceOver's
//  escape gesture included — clears the status for the next
//  opening.
// -----------------------------------------------------------

// The API base the builder must read — a host no code
// hardcodes, so a match proves where the host came from
jest.mock('@/services/api/client', () => ({
  API_BASE_URL: 'https://knf.example.lt/api',
  api: {},
  request: jest.fn(),
}));
// The sheet imports from the barrel; the real schedule module
// answers, on the mocked client above
jest.mock('@/services/api', () => jest.requireActual('@/services/api/schedule'));

const mockSetString = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockSetString(...(args as [])) }));

let mockLanguage = 'lt';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: mockLanguage } }),
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { brand: '#7B003F', success: '#2B762F', danger: '#C00' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@/components/ui', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Linking, Platform } from 'react-native';

import CalendarSubscribeSheet from '@/components/schedule/CalendarSubscribeSheet';
import { scheduleCalendarLinks } from '@/services/api/schedule';

const FEED = 'knf.example.lt/api/schedule/calendar.ics';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

let openURL: jest.SpyInstance;
let announce: jest.SpyInstance;

beforeEach(() => {
  mockLanguage = 'lt';
  mockSetString.mockReset().mockResolvedValue(true);
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  openURL.mockRestore();
  announce.mockRestore();
});


describe('scheduleCalendarLinks', () => {
  it("a group's three addresses ride the app's API base", () => {
    expect(scheduleCalendarLinks({ group: 'ISKS-2' }, 'lt')).toEqual({
      url: `https://${FEED}?group=ISKS-2&lang=lt`,
      webcal: `webcal://${FEED}?group=ISKS-2&lang=lt`,
      google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${FEED}?group=ISKS-2&lang=lt`)}`,
    });
  });

  it("a teacher's exact string is encoded — commas, spaces and diacritics survive the trip", () => {
    const links = scheduleCalendarLinks({ teacher: 'Ilona Veitaitė, Doc., Dr.' }, 'en');
    expect(links.url).toBe(`https://${FEED}?teacher=Ilona%20Veitait%C4%97%2C%20Doc.%2C%20Dr.&lang=en`);
    expect(new URL(links.url).searchParams.get('teacher')).toBe('Ilona Veitaitė, Doc., Dr.');
    // The cid carries the whole webcal link — the teacher's own
    // encoding nested inside Google's, undone in one decode
    const cid = new URL(links.google).searchParams.get('cid');
    expect(cid).toBe(links.webcal);
    expect(new URL(links.google).searchParams.get('group')).toBeNull();
  });

  it('a plain-http development base and a trailing slash still make one clean path', () => {
    const links = scheduleCalendarLinks({ group: 'PDF-1' }, 'lt', 'http://192.168.1.20:8000/api/');
    expect(links.url).toBe('http://192.168.1.20:8000/api/schedule/calendar.ics?group=PDF-1&lang=lt');
    expect(links.webcal).toBe('webcal://192.168.1.20:8000/api/schedule/calendar.ics?group=PDF-1&lang=lt');
  });
});


describe('CalendarSubscribeSheet', () => {
  it('closed without a scope', async () => {
    const view = await render(<CalendarSubscribeSheet scope={null} onClose={() => {}} />);
    expect(view.queryByTestId('calendar-subscribe-sheet')).toBeNull();
  });

  it("iOS opens the webcal:// feed in the app's language and closes", async () => {
    mockLanguage = 'en';
    const onClose = jest.fn();
    const view = await render(<CalendarSubscribeSheet scope={{ group: 'ISKS-2' }} onClose={onClose} />);
    expect(view.getByText('ISKS-2')).toBeTruthy();

    await fireEvent.press(view.getByText('schedule.openInCalendar'));
    await flush();

    expect(openURL).toHaveBeenCalledWith(`webcal://${FEED}?group=ISKS-2&lang=en`);
    expect(mockSetString).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('on Android', () => {
    let restoreOS: () => void;
    beforeEach(() => {
      const replaced = jest.replaceProperty(Platform, 'OS', 'android');
      restoreOS = () => replaced.restore();
    });
    afterEach(() => restoreOS());

    it("opens Google Calendar's add-by-URL page with the webcal link as its cid", async () => {
      const view = await render(<CalendarSubscribeSheet scope={{ teacher: 'A. Petraitis' }} onClose={() => {}} />);

      await fireEvent.press(view.getByText('schedule.openInCalendar'));
      await flush();

      const webcal = `webcal://${FEED}?teacher=A.%20Petraitis&lang=lt`;
      expect(openURL).toHaveBeenCalledWith(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`);
    });
  });

  it('an open nothing takes copies the https link instead, says so in the sheet and stays up', async () => {
    openURL.mockRejectedValue(new Error('No app to handle webcal:'));
    const onClose = jest.fn();
    const view = await render(<CalendarSubscribeSheet scope={{ group: 'ISKS-2' }} onClose={onClose} />);

    await fireEvent.press(view.getByText('schedule.openInCalendar'));
    await flush();

    expect(mockSetString).toHaveBeenCalledWith(`https://${FEED}?group=ISKS-2&lang=lt`);
    expect(view.getByText('schedule.calendarOpenFailed')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('schedule.calendarOpenFailed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"copy link" copies the https link — never the webcal one — and confirms in the sheet', async () => {
    const view = await render(<CalendarSubscribeSheet scope={{ group: 'ISKS-2' }} onClose={() => {}} />);

    await fireEvent.press(view.getByText('schedule.copyLink'));
    await flush();

    expect(mockSetString).toHaveBeenCalledWith(`https://${FEED}?group=ISKS-2&lang=lt`);
    expect(openURL).not.toHaveBeenCalled();
    expect(view.getByText('schedule.linkCopied')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('schedule.linkCopied');
    // The how-to stays in view for the paste
    expect(view.getByText('schedule.subscribeHowTo')).toBeTruthy();
  });

  it('a refused copy shows the link itself, selectable, as the way out', async () => {
    // expo-clipboard answers false (a web page without rights)
    mockSetString.mockResolvedValue(false);
    const view = await render(<CalendarSubscribeSheet scope={{ group: 'ISKS-2' }} onClose={() => {}} />);

    await fireEvent.press(view.getByText('schedule.copyLink'));
    await flush();

    expect(view.getByText('schedule.linkCopyFailed')).toBeTruthy();
    const url = view.getByTestId('calendar-subscribe-url');
    expect(url.props.children).toBe(`https://${FEED}?group=ISKS-2&lang=lt`);
    expect(url.props.selectable).toBe(true);
  });

  it('closing clears the status, so the next opening starts clean', async () => {
    const onClose = jest.fn();
    const view = await render(<CalendarSubscribeSheet scope={{ group: 'ISKS-2' }} onClose={onClose} />);

    await fireEvent.press(view.getByText('schedule.copyLink'));
    await flush();
    expect(view.getByTestId('calendar-subscribe-status')).toBeTruthy();

    await fireEvent.press(view.getByText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The parent keeps the scope in this test — the sheet stays
    // mounted, and the old outcome must be gone
    expect(view.queryByTestId('calendar-subscribe-status')).toBeNull();

    // VoiceOver's escape gesture is a way out too (the scrim is
    // hidden from screen readers)
    await fireEvent(view.getByTestId('calendar-subscribe-sheet'), 'accessibilityEscape');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
