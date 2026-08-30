// -----------------------------------------------------------
//  [*] chatuikit — media
//
//  Pure sizing and formatting helpers for photo and video
//  bubbles. fitMedia() is the one rule every media bubble,
//  the context menu's floating copy and the host's own
//  previews agree on, so a photo never changes size between
//  the list and the menu.
//
//  The rule (Stream's single-image fit, with Flyer's ratio
//  clamps): scale the natural size into the box, clamp the
//  ratio so panoramas and slivers stay readable, and never
//  fall under the minimums — a tiny sticker still gets a
//  tappable bubble.
//
//  Split into:
//
//    MediaBox        — the bounds a bubble may fill
//    fitMedia        — natural size (or ratio) → bubble size
//    mediaBoxFor     — the MediaBox for a viewport width
//    formatDuration  — 83 → "1:23"
//    formatBytes     — 1536 → "1.5 KB"
//
//  Used by:
//    - message/attachments/ImageAttachment.tsx
//    - message/attachments/VideoAttachment.tsx
//    - message/attachments/FileCard.tsx
//    - menu/MessageContextMenu.tsx (through BubbleBody)
// -----------------------------------------------------------

import {
  MEDIA_MAX_HEIGHT,
  MEDIA_MAX_WIDTH_CAP,
  MEDIA_MAX_WIDTH_SHARE,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
} from './metrics';


export interface MediaBox {
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
  minHeight: number;
}

// The widest a landscape photo is allowed to be (w/h) and the
// tallest a portrait one (w/h) — beyond these the bubble crops
// (contentFit cover) instead of thinning into a strip
export const MAX_ASPECT = 2.2;
export const MIN_ASPECT = 0.5;

// The ratio a bubble is laid out with before the bytes tell
export const DEFAULT_ASPECT = 4 / 3;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));







// -----------------------------------------------------------
// mediaBoxFor
// -----------------------------------------------------------
//
// The box for a viewport: a share of the width, capped, with
// the kit's height and minimums.
//
// Used by:
//   - the media bubbles (through useWindowDimensions)
// -----------------------------------------------------------

export function mediaBoxFor(viewportWidth: number): MediaBox {
  const maxWidth = Math.max(MEDIA_MIN_WIDTH, Math.min(MEDIA_MAX_WIDTH_CAP, Math.round(viewportWidth * MEDIA_MAX_WIDTH_SHARE)));
  return { maxWidth, maxHeight: MEDIA_MAX_HEIGHT, minWidth: MEDIA_MIN_WIDTH, minHeight: MEDIA_MIN_HEIGHT };
}







// -----------------------------------------------------------
// fitMedia
// -----------------------------------------------------------
//
//   fitMedia(4 / 3, box)                  — from a ratio
//   fitMedia({ width: 1200, height: 800 }, box)
//
// Returns the bubble's { width, height, ratio }. The ratio is
// clamped first (a 10:1 panorama renders as 2.2:1 and crops),
// then the size is fitted: width-bound for landscape, height-
// bound for portrait, and the minimums win last — a result is
// never narrower than minWidth or shorter than minHeight.
// Integers, so two bubbles of the same photo never differ by
// a sub-pixel.
//
// Used by:
//   - ImageAttachment / VideoAttachment
// -----------------------------------------------------------

export function fitMedia(
  source: number | { width: number; height: number } | undefined | null,
  box: MediaBox,
): { width: number; height: number; ratio: number } {
  const raw =
    typeof source === 'number' ? source
    : source && source.width > 0 && source.height > 0 ? source.width / source.height
    : DEFAULT_ASPECT;
  const ratio = Number.isFinite(raw) && raw > 0 ? clamp(raw, MIN_ASPECT, MAX_ASPECT) : DEFAULT_ASPECT;

  let width = box.maxWidth;
  let height = width / ratio;
  if (height > box.maxHeight) {
    height = box.maxHeight;
    width = height * ratio;
  }
  width = Math.max(box.minWidth, width);
  height = Math.max(box.minHeight, height);
  return { width: Math.round(width), height: Math.round(height), ratio };
}







// -----------------------------------------------------------
// formatDuration / formatBytes
// -----------------------------------------------------------
//
// Used by:
//   - VideoAttachment (duration badge), FileCard (size line)
// -----------------------------------------------------------

export function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

export function formatBytes(size?: number | null): string {
  if (!size || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
