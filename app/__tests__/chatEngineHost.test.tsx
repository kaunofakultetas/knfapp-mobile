// -----------------------------------------------------------
//  [*] Tests — ChatEngineHost, engine notices → toasts
//
//  Every engine notice lands on a catalog string that names
//  what actually failed: an upload failure's detail picks the
//  photo / video / file / voice wording (a failed voice note
//  once toasted "couldn't upload the photo"), a too-long clip
//  gets its own line, and every code has SOME catalog key in
//  both languages.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', displayName: 'Ieva', avatarUrl: null } }) }));

// The toast spy — every notice's (level, message) lands here
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@/services/chatTransport', () => ({ chatTransport: {} }));
jest.mock('@/services/api', () => ({ MAX_UPLOAD_BYTES: 10, MAX_VIDEO_UPLOAD_BYTES: 20 }));
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => ({ onRestore: () => () => {} }) }));
jest.mock('@knf/chatuikit/composer/Composer', () => ({ DEFAULT_MAX_LENGTH: 4000 }));

// The provider is swapped for a probe that keeps the host's
// notify callback, so each test can fire a notice through it
let mockNotify: ((notice: EngineNotice) => void) | null = null;
jest.mock('@knf/chatengine', () => ({
  ChatEngineProvider: ({ notify, children }: { notify: (notice: EngineNotice) => void; children: ReactNode }) => {
    mockNotify = notify;
    return children;
  },
}));

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { EngineNotice, NoticeCode } from '@knf/chatengine';
import ChatEngineHost from '@/components/chat/ChatEngineHost';
import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';


// Every code the engine can raise (a new one fails the
// catalog test below until it gets a string)
const CODES: NoticeCode[] = [
  'send_failed', 'send_too_long', 'send_quote_gone', 'send_forbidden', 'session_expired', 'timeout',
  'upload_failed', 'upload_too_large', 'edit_failed', 'delete_failed', 'load_older_failed',
  'reaction_target_gone', 'reaction_add_failed', 'reaction_remove_failed',
];







// -----------------------------------------------------------
// toastFor
// -----------------------------------------------------------
//
// Mounts the host, fires one notice through its notify
// callback and answers the catalog key the toast carried.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function toastFor(notice: EngineNotice): Promise<string> {
  mockToast.mockClear();
  await render(<ChatEngineHost>{null}</ChatEngineHost>);
  mockNotify?.(notice);
  return mockToast.mock.calls[0]?.[1];
}







// -----------------------------------------------------------
// lookup
// -----------------------------------------------------------
//
// A dotted catalog key's value in one language's catalog, or
// undefined when any step is missing.
//
// Used by:
//   - the catalog test below
// -----------------------------------------------------------

function lookup(catalog: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), catalog);
}


describe('ChatEngineHost notices', () => {
  it('an upload failure names what failed', async () => {
    expect(await toastFor({ level: 'error', code: 'upload_failed', detail: 'audio' })).toBe('chat.voiceUploadError');
    expect(await toastFor({ level: 'error', code: 'upload_failed', detail: 'video' })).toBe('chat.videoUploadError');
    expect(await toastFor({ level: 'error', code: 'upload_failed', detail: 'file' })).toBe('chat.fileUploadError');
    expect(await toastFor({ level: 'error', code: 'upload_failed', detail: 'image' })).toBe('chat.imageUploadError');
    // A parked send with nothing left to upload carries no detail
    expect(await toastFor({ level: 'error', code: 'upload_failed' })).toBe('chat.imageUploadError');
  });

  it('a clip over the length cap says so, any other oversize says too large', async () => {
    expect(await toastFor({ level: 'error', code: 'upload_too_large', detail: 'video_duration' })).toBe('chat.videoTooLong');
    expect(await toastFor({ level: 'error', code: 'upload_too_large', detail: 'audio' })).toBe('chat.fileTooLarge');
  });

  it('an info notice toasts as info, an error as error', async () => {
    await toastFor({ level: 'info', code: 'send_quote_gone' });
    expect(mockToast).toHaveBeenCalledWith('info', 'chat.sendQuoteGone');
    await toastFor({ level: 'error', code: 'send_failed' });
    expect(mockToast).toHaveBeenCalledWith('error', 'chat.sendError');
  });

  it('every notice lands on a string that exists in both catalogs', async () => {
    const details = [undefined, 'image', 'video', 'file', 'audio', 'video_duration'];
    for (const code of CODES) {
      for (const detail of details) {
        const key = await toastFor({ level: 'error', code, detail });
        expect([key, typeof lookup(lt, key), typeof lookup(en, key)]).toEqual([key, 'string', 'string']);
      }
    }
  });
});
