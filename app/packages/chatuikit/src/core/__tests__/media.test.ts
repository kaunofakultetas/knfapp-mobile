// -----------------------------------------------------------
//  [*] Tests — chatuikit media helpers
//
//  The pure sizing and formatting rules every media bubble
//  agrees on: fitMedia (a single-image fit with ratio clamps), the
//  box per viewport, the duration / size
//  formatters, the reply snippet per kind and the file glyph.
// -----------------------------------------------------------

import { DEFAULT_ASPECT, MAX_ASPECT, MIN_ASPECT, fitMedia, formatBytes, formatDuration, mediaBoxFor, messageKind, replySnippet, defaultLabels, fileGlyph, type KitMessage } from '../../index';


const box = { maxWidth: 300, maxHeight: 320, minWidth: 120, minHeight: 96 };

const base: KitMessage = {
  id: 'm1', senderId: 'u1', senderName: 'Ona', text: '', createdAt: '2026-08-30T10:00:00Z',
  isOwn: false, status: 'read', reactions: [],
};


describe('fitMedia', () => {
  it('lays a landscape photo out width-bound at its own ratio', () => {
    expect(fitMedia({ width: 1200, height: 800 }, box)).toEqual({ width: 300, height: 200, ratio: 1.5 });
  });

  it('lays a portrait photo out height-bound — never a square', () => {
    const fit = fitMedia({ width: 800, height: 1200 }, box);
    expect(fit.height).toBe(320);
    expect(fit.width).toBe(213);
    expect(fit.width).toBeLessThan(fit.height);
  });

  it('clamps a panorama and a sliver to the readable ratios', () => {
    expect(fitMedia({ width: 5000, height: 400 }, box).ratio).toBe(MAX_ASPECT);
    expect(fitMedia({ width: 200, height: 3000 }, box).ratio).toBe(MIN_ASPECT);
  });

  it('never goes under the minimums', () => {
    const fit = fitMedia(MAX_ASPECT, { ...box, maxHeight: 60 });
    expect(fit.height).toBeGreaterThanOrEqual(box.minHeight);
    expect(fit.width).toBeGreaterThanOrEqual(box.minWidth);
  });

  it('falls back to 4:3 without a size and accepts a bare ratio', () => {
    expect(fitMedia(undefined, box).ratio).toBe(DEFAULT_ASPECT);
    expect(fitMedia({ width: 0, height: 0 }, box).ratio).toBe(DEFAULT_ASPECT);
    expect(fitMedia(Number.NaN, box).ratio).toBe(DEFAULT_ASPECT);
    expect(fitMedia(1, box)).toEqual({ width: 300, height: 300, ratio: 1 });
  });

  it('answers integers so two bubbles of one photo never differ by a sub-pixel', () => {
    const fit = fitMedia({ width: 1001, height: 777 }, box);
    expect(Number.isInteger(fit.width) && Number.isInteger(fit.height)).toBe(true);
  });
});


describe('mediaBoxFor', () => {
  it('takes a share of the viewport, capped, with the kit minimums', () => {
    expect(mediaBoxFor(390)).toEqual({ maxWidth: 265, maxHeight: 320, minWidth: 120, minHeight: 96 });
    expect(mediaBoxFor(1200).maxWidth).toBe(320);
    expect(mediaBoxFor(100).maxWidth).toBe(120);
  });
});


describe('formatDuration / formatBytes', () => {
  it('formats seconds as m:ss and hours as h:mm:ss', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(-4)).toBe('');
  });

  it('formats byte sizes with one decimal past kilobytes', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});


describe('messageKind with video', () => {
  it('infers video from the attachment and lets kind win', () => {
    expect(messageKind({ ...base, video: { uri: '/api/uploads/a.mp4' } })).toBe('video');
    expect(messageKind({ ...base, imageUrl: '/api/uploads/a.jpg' })).toBe('image');
    expect(messageKind({ ...base, kind: 'system', text: 'Ona paliko pokalbį' })).toBe('system');
  });
});


describe('replySnippet', () => {
  const labels = defaultLabels.lt;
  const reply = { id: 'r', senderId: 'u2', senderName: 'Jonas', text: '', deleted: false };

  it('says what the quoted message carried when it has no text', () => {
    expect(replySnippet({ ...reply, text: 'Labas' }, labels)).toBe('Labas');
    expect(replySnippet({ ...reply, imageUrl: '/api/uploads/a.jpg' }, labels)).toBe('Nuotrauka');
    expect(replySnippet({ ...reply, kind: 'video' }, labels)).toBe('Vaizdo įrašas');
    expect(replySnippet({ ...reply, kind: 'file', fileName: 'planas.pdf' }, labels)).toBe('planas.pdf');
    expect(replySnippet({ ...reply, kind: 'file' }, labels)).toBe('Failas');
    expect(replySnippet({ ...reply, deleted: true, text: 'x' }, labels)).toBe(labels.deleted);
  });
});


describe('fileGlyph', () => {
  it('keys the glyph to the extension', () => {
    expect(fileGlyph('planas.pdf')).toBe('document-text-outline');
    expect(fileGlyph('lentele.XLSX')).toBe('grid-outline');
    expect(fileGlyph('skaidres.pptx')).toBe('easel-outline');
    expect(fileGlyph('archyvas.zip')).toBe('archive-outline');
    expect(fileGlyph('pastabos.txt')).toBe('reader-outline');
    expect(fileGlyph('kazkas')).toBe('document-outline');
  });
});
