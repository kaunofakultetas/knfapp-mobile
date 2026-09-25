// -----------------------------------------------------------
//  [*] Tests — what a screen reader hears on an arrival
//
//  A caption-less arrival is announced by its KIND — it once
//  said "photo" for a video, a voice note or a PDF — and a
//  system line by its worded event, with no sender prefix.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } }));
jest.mock('react-native-gesture-handler', () => {
  const builder = () => {
    const gesture: Record<string, unknown> = {};
    const chain = () => gesture;
    for (const method of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd', 'onFinalize', 'minDistance', 'hitSlop']) gesture[method] = chain;
    return gesture;
  };
  return { Gesture: { Pan: builder, Tap: builder, LongPress: builder }, GestureDetector: ({ children }: { children: unknown }) => children };
});

import type { KitMessage } from '../../core/types';
import { defaultLabels } from '../../provider/labels';
import { arrivalAnnouncement } from '../MessageList';


// The kit's own English wording
const labels = defaultLabels.en;







// -----------------------------------------------------------
// msg
// -----------------------------------------------------------
//
// A foreign arrival with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const msg = (over: Partial<KitMessage>): KitMessage => ({
  id: 'm', senderId: 'u2', senderName: 'Ona', text: '', createdAt: '2026-09-19T10:00:00Z', isOwn: false, status: 'read', reactions: [], ...over,
});


describe('arrivalAnnouncement', () => {
  it('names a caption-less arrival by its kind', () => {
    expect(arrivalAnnouncement(msg({ kind: 'video', video: { uri: '/v.mp4' } }), labels)).toBe('Ona: Video');
    expect(arrivalAnnouncement(msg({ kind: 'audio', audio: { uri: '/a.m4a' } }), labels)).toBe('Ona: Voice message');
    expect(arrivalAnnouncement(msg({ kind: 'file', file: { name: 'konspektas.pdf', uri: '/f.pdf' } }), labels)).toBe('Ona: konspektas.pdf');
    expect(arrivalAnnouncement(msg({ kind: 'image', imageUrl: '/p.jpg' }), labels)).toBe('Ona: Photo');
  });

  it('reads the text first, and a system line without a sender', () => {
    expect(arrivalAnnouncement(msg({ text: 'labas' }), labels)).toBe('Ona: labas');
    expect(arrivalAnnouncement(msg({ kind: 'system', text: 'Ona paliko pokalbį', system: { event: 'left' } }), labels)).toBe('Ona left the conversation');
  });
});
