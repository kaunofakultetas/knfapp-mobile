// -----------------------------------------------------------
//  [*] Tests — the room's photo viewer follows the photo on
//      screen
//
//  useImageViewer once tracked the TAPPED photo: swipe from B
//  to C, and removing B closed the viewer with "photo deleted"
//  while C was on screen; removing an older photo shifted B's
//  index, and the modal's resync snapped the viewer back from
//  C to B. The hook now follows every swipe (view), and the
//  modal moves the gallery only to a position it is not
//  already showing — never for its own swipe echoed back.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The toast spy — (level, message) per toast
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@/services/api', () => ({ getUploadUrl: (url: string) => (url.startsWith('/uploads/') ? `https://knf.test${url}` : null) }));
jest.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ colors: { onBrand: '#fff', scrim: '#0008' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// The gallery stand-in: its imperative setIndex is a spy, and
// its last props (onIndexChange) stay reachable
const mockGallerySetIndex = jest.fn();
let mockGalleryProps: { onIndexChange?: (idx: number) => void; data: { id: string }[] } | null = null;
jest.mock('react-native-awesome-gallery', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockGallery = React.forwardRef((props: { onIndexChange?: (idx: number) => void; data: { id: string }[] }, ref: unknown) => {
    mockGalleryProps = props;
    React.useImperativeHandle(ref, () => ({ setIndex: mockGallerySetIndex, reset: jest.fn() }));
    return React.createElement(View, { testID: 'gallery' });
  });
  MockGallery.displayName = 'MockGallery';
  return { __esModule: true, default: MockGallery };
});

import { act, render, renderHook } from '@testing-library/react-native';

import type { KitMessage } from '@knf/chatuikit';
import ImageViewerModal, { type ViewerImage } from '@/components/chat/ImageViewerModal';
import { useImageViewer } from '@/hooks/chat/useImageViewer';


// Three photo messages, newest first like list state
const NEWEST_FIRST = [
  { id: 'm3', imageUrl: '/uploads/c.jpg', deleted: false },
  { id: 'm2', imageUrl: '/uploads/b.jpg', deleted: false },
  { id: 'm1', imageUrl: '/uploads/a.jpg', deleted: false },
] as KitMessage[];

// The same entries the hook builds, chronological
const ENTRIES: ViewerImage[] = [
  { id: 'm1', uri: 'https://knf.test/uploads/a.jpg' },
  { id: 'm2', uri: 'https://knf.test/uploads/b.jpg' },
  { id: 'm3', uri: 'https://knf.test/uploads/c.jpg' },
];







// -----------------------------------------------------------
// viewer
// -----------------------------------------------------------
//
// The hook over a swappable message list.
//
// Used by:
//   - the hook tests below
// -----------------------------------------------------------

async function viewer() {
  return renderHook(({ messages }: { messages: KitMessage[] }) => useImageViewer(messages), { initialProps: { messages: NEWEST_FIRST } });
}


describe('useImageViewer', () => {
  beforeEach(() => mockToast.mockClear());

  it('builds the entries oldest first and opens on the tapped photo', async () => {
    const hook = await viewer();
    expect(hook.result.current.images).toEqual(ENTRIES);
    await act(async () => hook.result.current.openImage(NEWEST_FIRST[1]));
    expect(hook.result.current.visible).toBe(true);
    expect(hook.result.current.index).toBe(1);
  });

  it('removing the TAPPED photo after a swipe away keeps the viewer open', async () => {
    const hook = await viewer();
    await act(async () => hook.result.current.openImage(NEWEST_FIRST[1]));
    await act(async () => hook.result.current.view('m3'));
    await act(async () => hook.rerender({ messages: [NEWEST_FIRST[0], NEWEST_FIRST[2]] }));
    expect(hook.result.current.visible).toBe(true);
    expect(hook.result.current.index).toBe(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('removing an older photo moves the index with the viewed photo', async () => {
    const hook = await viewer();
    await act(async () => hook.result.current.openImage(NEWEST_FIRST[1]));
    await act(async () => hook.result.current.view('m3'));
    expect(hook.result.current.index).toBe(2);
    await act(async () => hook.rerender({ messages: [NEWEST_FIRST[0], NEWEST_FIRST[1]] }));
    expect(hook.result.current.index).toBe(1);
    expect(hook.result.current.images[1].id).toBe('m3');
  });

  it('removing the photo ON SCREEN closes the viewer with a toast', async () => {
    const hook = await viewer();
    await act(async () => hook.result.current.openImage(NEWEST_FIRST[1]));
    await act(async () => hook.result.current.view('m3'));
    await act(async () => hook.rerender({ messages: [{ ...NEWEST_FIRST[0], deleted: true }, NEWEST_FIRST[1], NEWEST_FIRST[2]] as KitMessage[] }));
    expect(hook.result.current.visible).toBe(false);
    expect(mockToast).toHaveBeenCalledWith('info', 'chat.imageRemoved');
  });
});


describe('ImageViewerModal', () => {
  beforeEach(() => {
    mockGallerySetIndex.mockClear();
    mockGalleryProps = null;
  });

  it('reports every swipe and never snaps its own swipe back', async () => {
    const onViewChange = jest.fn();
    const view = await render(<ImageViewerModal visible images={ENTRIES} initialIndex={1} onViewChange={onViewChange} onClose={() => {}} />);
    // The fresh open lands on the tapped photo
    expect(mockGallerySetIndex).toHaveBeenLastCalledWith(1);
    mockGallerySetIndex.mockClear();
    await act(async () => mockGalleryProps?.onIndexChange?.(2));
    expect(onViewChange).toHaveBeenCalledWith('m3');
    // The host echoes the swipe back as the new index
    await view.rerender(<ImageViewerModal visible images={ENTRIES} initialIndex={2} onViewChange={onViewChange} onClose={() => {}} />);
    expect(mockGallerySetIndex).not.toHaveBeenCalled();
  });

  it('follows the viewed photo when a photo before it is removed', async () => {
    const view = await render(<ImageViewerModal visible images={ENTRIES} initialIndex={2} onClose={() => {}} />);
    mockGallerySetIndex.mockClear();
    await view.rerender(<ImageViewerModal visible images={[ENTRIES[1], ENTRIES[2]]} initialIndex={1} onClose={() => {}} />);
    expect(mockGallerySetIndex).toHaveBeenCalledWith(1);
  });

  it('a reopen lands on the tapped photo even where the last visit ended', async () => {
    const view = await render(<ImageViewerModal visible images={ENTRIES} initialIndex={2} onClose={() => {}} />);
    await view.rerender(<ImageViewerModal visible={false} images={ENTRIES} initialIndex={0} onClose={() => {}} />);
    mockGallerySetIndex.mockClear();
    await view.rerender(<ImageViewerModal visible images={ENTRIES} initialIndex={2} onClose={() => {}} />);
    expect(mockGallerySetIndex).toHaveBeenCalledWith(2);
  });
});
