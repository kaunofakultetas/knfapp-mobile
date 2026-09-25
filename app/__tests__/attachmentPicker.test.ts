// -----------------------------------------------------------
//  [*] Tests — useAttachmentPicker's re-entry guard
//
//  A double tap opens ONE picker, but the guard ends when the
//  picker closes: a video still uploading must not leave the
//  attach tiles dead for minutes (the guard once spanned the
//  whole upload, so a second photo silently did nothing). A
//  pick that succeeded never toasts "could not pick", even if
//  the hand-off after it throws.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The toast spy — (level, message) per toast
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

import { act, renderHook } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { useAttachmentPicker } from '@/hooks/chat/useAttachmentPicker';


// One library pick: a single photo
const PHOTO = { canceled: false, assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 10, type: 'image', width: 4, height: 3 }] };
// One document pick
const DOC = { canceled: false, assets: [{ uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: 10 }] };


describe('useAttachmentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(PHOTO);
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue(PHOTO);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue(DOC);
  });

  it('a double tap opens one picker', async () => {
    const onPicked = jest.fn(async () => {});
    const { result } = await renderHook(() => useAttachmentPicker(onPicked));
    await act(async () => {
      await Promise.all([result.current.pickMedia(), result.current.pickMedia(), result.current.pickFile()]);
    });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
    expect(onPicked).toHaveBeenCalledTimes(1);
  });

  it('the tiles work again while the first pick is still uploading', async () => {
    // The first upload never finishes during the test
    const onPicked = jest.fn(() => new Promise<void>(() => {}));
    const { result } = await renderHook(() => useAttachmentPicker(onPicked));
    await act(async () => {
      void result.current.pickMedia();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
    await act(async () => {
      void result.current.pickFile();
      void result.current.pickCamera();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(onPicked).toHaveBeenCalledTimes(2);
    expect(onPicked.mock.calls[1]).toEqual([expect.objectContaining({ kind: 'file', name: 'a.pdf' })]);
  });

  it('a failed hand-off after a good pick never says the pick failed', async () => {
    const onPicked = jest.fn(async () => {
      throw new Error('boom');
    });
    const { result } = await renderHook(() => useAttachmentPicker(onPicked));
    await act(async () => {
      await result.current.pickMedia();
    });
    expect(mockToast).toHaveBeenCalledWith('error', 'chat.sendError');
    expect(mockToast).not.toHaveBeenCalledWith('error', 'chat.mediaPickError');
  });

  it('a picker that throws toasts the pick error and frees the guard', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValueOnce(new Error('no library'));
    const onPicked = jest.fn(async () => {});
    const { result } = await renderHook(() => useAttachmentPicker(onPicked));
    await act(async () => {
      await result.current.pickMedia();
    });
    expect(mockToast).toHaveBeenCalledWith('error', 'chat.mediaPickError');
    expect(onPicked).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.pickMedia();
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
  });

  it('several photos go to the gallery hand-off in one call', async () => {
    const second = { ...PHOTO.assets[0], uri: 'file:///b.jpg', fileName: 'b.jpg' };
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [PHOTO.assets[0], second] });
    const onPicked = jest.fn(async () => {});
    const onPickedMany = jest.fn(async () => {});
    const { result } = await renderHook(() => useAttachmentPicker(onPicked, onPickedMany));
    await act(async () => {
      await result.current.pickMedia();
    });
    expect(onPicked).not.toHaveBeenCalled();
    expect(onPickedMany).toHaveBeenCalledWith([expect.objectContaining({ uri: 'file:///a.jpg' }), expect.objectContaining({ uri: 'file:///b.jpg' })]);
  });
});
