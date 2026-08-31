// -----------------------------------------------------------
//  [*] Tests — socialuikit MediaGallery
//
//  The album frame, pinned: the gallerySpans table for 1–4 and
//  its cap past four, the '+N' wash on the last tile, a lone
//  image bending the frame to its own (clamped) proportions,
//  the ALT chip only on described tiles, taps handing the index
//  up, the video overlays, and the line-coloured placeholder
//  flipping away on load — per tile, not per gallery.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { KitMediaItem } from '../../core/types';
import { defaultTheme } from '../../provider/theme';
import MediaGallery, { gallerySpans } from '../MediaGallery';


const photos = (n: number): KitMediaItem[] =>
  Array.from({ length: n }, (_, i) => ({ url: `/uploads/p${i}.jpg`, kind: 'image' as const, width: 800, height: 600 }));

// Pressable hands the host element a nested style; flatten
// before reading a single property
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

const frameAspect = async (items: KitMediaItem[]) => {
  const r = await render(<MediaGallery items={items} />);
  return flat(r.getByTestId('socialuikit-gallery').props.style).aspectRatio as number;
};




describe('gallerySpans', () => {

  it('lays 1–4 out per the fixed table and caps past four', () => {
    expect(gallerySpans(1)).toEqual([{ tall: true, wide: true }]);
    expect(gallerySpans(2)).toEqual([
      { tall: true, wide: false },
      { tall: true, wide: false },
    ]);
    expect(gallerySpans(3)).toEqual([
      { tall: true, wide: false },
      { tall: false, wide: false },
      { tall: false, wide: false },
    ]);
    expect(gallerySpans(4)).toEqual([
      { tall: false, wide: false },
      { tall: false, wide: false },
      { tall: false, wide: false },
      { tall: false, wide: false },
    ]);

    // The extras never render, so the table never grows either
    expect(gallerySpans(9)).toEqual(gallerySpans(4));
    expect(gallerySpans(0)).toEqual([]);
    expect(gallerySpans(-3)).toEqual([]);
  });
});




describe('MediaGallery', () => {

  it('caps at four tiles and washes the last with +N', async () => {
    const r = await render(<MediaGallery items={photos(6)} />);

    expect(r.getByTestId('socialuikit-gallery-item-3')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-gallery-item-4')).toBeNull();
    expect(r.getByText('+2')).toBeTruthy();

    // Exactly four shows everything — no wash
    const four = await render(<MediaGallery items={photos(4)} />);
    expect(four.getByTestId('socialuikit-gallery-item-3')).toBeTruthy();
    expect(four.queryByText(/^\+\d+$/)).toBeNull();
  });


  it('keeps albums at 3:2 and lets a lone image bend the frame, clamped', async () => {
    expect(await frameAspect(photos(3))).toBeCloseTo(3 / 2);

    // A lone image's own shape wins…
    expect(await frameAspect([{ url: '/a.jpg', kind: 'image', width: 800, height: 600 }])).toBeCloseTo(800 / 600);

    // …but only inside [0.5, 2.2]
    expect(await frameAspect([{ url: '/b.jpg', kind: 'image', width: 4000, height: 1000 }])).toBeCloseTo(2.2);
    expect(await frameAspect([{ url: '/c.jpg', kind: 'image', width: 100, height: 1000 }])).toBeCloseTo(0.5);

    // No dimensions → the album default
    expect(await frameAspect([{ url: '/d.jpg', kind: 'image' }])).toBeCloseTo(3 / 2);

    // maxHeight rides through to the frame
    const capped = await render(<MediaGallery items={photos(1)} maxHeight={240} />);
    expect(flat(capped.getByTestId('socialuikit-gallery').props.style).maxHeight).toBe(240);
  });


  it('shows the ALT chip only on described tiles', async () => {
    const items: KitMediaItem[] = [
      { url: '/a.jpg', kind: 'image', alt: 'Fakulteto kiemas' },
      { url: '/b.jpg', kind: 'image' },
    ];
    const r = await render(<MediaGallery items={items} />);

    expect(r.getAllByText('ALT')).toHaveLength(1);
    // The description doubles as the tile's spoken name
    expect(r.getByLabelText('Fakulteto kiemas')).toBeTruthy();
  });


  it('hands the tapped index up', async () => {
    const onPressItem = jest.fn();
    const r = await render(<MediaGallery items={photos(4)} onPressItem={onPressItem} />);

    await fireEvent.press(r.getByTestId('socialuikit-gallery-item-2'));
    expect(onPressItem).toHaveBeenCalledWith(2);
  });


  it('overlays a video tile with the play glyph and duration chip', async () => {
    const r = await render(
      <MediaGallery items={[{ url: '/v.mp4', kind: 'video', thumbnailUrl: '/v.jpg', duration: 65 }]} />,
    );

    expect(r.getByTestId('socialuikit-gallery-play-0')).toBeTruthy();
    expect(r.getByText('1:05')).toBeTruthy();
  });


  it('drops the line-coloured placeholder once that tile loads', async () => {
    const r = await render(<MediaGallery items={photos(2)} />);

    expect(flat(r.getByTestId('socialuikit-gallery-item-0').props.style).backgroundColor).toBe(defaultTheme.colors.line);

    await fireEvent(r.getByTestId('socialuikit-gallery-img-0'), 'load', { nativeEvent: {} });

    expect(flat(r.getByTestId('socialuikit-gallery-item-0').props.style).backgroundColor).toBe('transparent');
    // The neighbour keeps its ground until its own bytes arrive
    expect(flat(r.getByTestId('socialuikit-gallery-item-1').props.style).backgroundColor).toBe(defaultTheme.colors.line);
  });

  it('renders exactly the tiles the spans table names, count by count', async () => {
    for (const n of [1, 2, 3, 4]) {
      const r = await render(<MediaGallery items={photos(n)} />);
      const spans = gallerySpans(n);
      expect(spans).toHaveLength(n);
      for (let i = 0; i < n; i++) expect(r.getByTestId(`socialuikit-gallery-item-${i}`)).toBeTruthy();
      expect(r.queryByTestId(`socialuikit-gallery-item-${n}`)).toBeNull();
      // unmount is async in RNTL 14 — un-awaited it resolves
      // during the NEXT render and tears the fresh tree down
      await r.unmount();
    }
  });

  it('realises the 3-count arrangement: a lone left tile, two stacked right', async () => {
    const r = await render(<MediaGallery items={photos(3)} />);
    const second = r.getByTestId('socialuikit-gallery-item-1');
    const third = r.getByTestId('socialuikit-gallery-item-2');
    const first = r.getByTestId('socialuikit-gallery-item-0');
    // The stacked pair shares a column the tall tile is not in
    expect(second.parent).toBe(third.parent);
    expect(first.parent).not.toBe(second.parent);
  });

  it('a handled tile tap stops propagation — the enclosing card must not also fire', async () => {
    const onPressItem = jest.fn();
    const stopPropagation = jest.fn();
    const r = await render(<MediaGallery items={photos(2)} onPressItem={onPressItem} />);
    await fireEvent.press(r.getByTestId('socialuikit-gallery-item-1'), { stopPropagation });
    expect(onPressItem).toHaveBeenCalledWith(1);
    expect(stopPropagation).toHaveBeenCalled();
  });
});
