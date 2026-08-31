// -----------------------------------------------------------
//  [*] Tests — the formatters' edges, pinned
//
//  Duration rollovers (the hour mark changes the shape) and
//  byte boundaries — the small formatting truths screenshots
//  get compared against, so a refactor cannot drift them.
// -----------------------------------------------------------

import { formatBytes, formatDuration } from '../media';

describe('formatDuration', () => {
  it('rolls the shape over at the hour', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('answers nothing for garbage', () => {
    expect(formatDuration(-5)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(null)).toBe('');
  });
});

describe('formatBytes', () => {
  it('walks the unit boundaries', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
