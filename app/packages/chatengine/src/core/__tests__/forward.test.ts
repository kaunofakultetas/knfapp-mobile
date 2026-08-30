// -----------------------------------------------------------
//  [*] Tests — the forward payload
//
//  A held message becomes the OutgoingMessage that re-sends
//  its content elsewhere: the mark is set, uploads ride as
//  they are, quotes and link cards stay behind, and every
//  kind carries what it needs (frame, duration, poster,
//  waveform, gallery previews).
// -----------------------------------------------------------

import { forwardPayload } from '../forward';
import type { ChatMessage } from '../types';

const base: ChatMessage = {
  id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: '', createdAt: '2026-08-29T10:00:00Z',
  isOwn: false, status: 'read', reactions: [], deleted: false,
};

describe('forwardPayload', () => {
  it('marks the copy and strips what belongs to the source room', () => {
    const source: ChatMessage = { ...base, text: 'labas', replyTo: { id: 'q', senderId: 'x', senderName: 'Y', text: 'q', deleted: false }, linkPreview: { url: 'https://knf.vu.lt', title: 't', description: '', siteName: 's' } };
    const out = forwardPayload(source, 'nonce-1');
    expect(out).toEqual({ text: 'labas', clientId: 'nonce-1', forwarded: true });
  });

  it('carries a voice note whole — attachment, duration, waveform', () => {
    const out = forwardPayload({ ...base, kind: 'audio', audio: { uri: '/api/uploads/v.m4a', duration: 12, size: 900, mimeType: 'audio/mp4', name: 'v.m4a', waveform: [0.2, 0.8] } }, 'n');
    expect(out.kind).toBe('audio');
    expect(out.attachment).toEqual({ url: '/api/uploads/v.m4a', name: 'v.m4a', size: 900, mime: 'audio/mp4' });
    expect(out.media).toEqual({ duration: 12, waveform: [0.2, 0.8] });
  });

  it('carries a gallery with its frames and previews', () => {
    const out = forwardPayload({ ...base, kind: 'image', gallery: [{ url: '/api/uploads/a.jpg', width: 800, height: 600, preview: 'data:image/jpeg;base64,x' }, { url: '/api/uploads/b.jpg' }] }, 'n');
    expect(out.gallery).toHaveLength(2);
    expect(out.gallery?.[0]).toEqual({ url: '/api/uploads/a.jpg', width: 800, height: 600, preview: 'data:image/jpeg;base64,x' });
    expect(out.forwarded).toBe(true);
  });
});
