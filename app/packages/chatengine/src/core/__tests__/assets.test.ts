import { normalizeAssetName } from '../assets';

describe('normalizeAssetName', () => {
  it('lets the extension follow the bytes (HEIC handed over as JPEG), keeps agreeing names, names the nameless', () => {
    expect(normalizeAssetName({ name: 'IMG_0001.HEIC', mimeType: 'image/jpeg', uri: 'file:///a', kind: 'image' })).toBe('IMG_0001.jpg');
    expect(normalizeAssetName({ name: 'photo.jpeg', mimeType: 'image/jpeg', uri: 'file:///a', kind: 'image' })).toBe('photo.jpeg');
    expect(normalizeAssetName({ name: 'clip.MOV', mimeType: 'video/quicktime', uri: 'file:///v', kind: 'video' })).toBe('clip.MOV');
    expect(normalizeAssetName({ name: 'clip.mov', mimeType: 'video/mp4', uri: 'file:///v', kind: 'video' })).toBe('clip.mp4');
    expect(normalizeAssetName({ name: 'noext', mimeType: 'application/pdf', uri: 'file:///d', kind: 'file' })).toBe('noext.pdf');
    expect(normalizeAssetName({ name: '', mimeType: 'image/png', uri: 'file:///a', kind: 'image' })).toBe('image.png');
    expect(normalizeAssetName({ name: 'x.bin', mimeType: 'application/x-thing', uri: 'file:///a', kind: 'file' })).toBe('x.bin');
    expect(normalizeAssetName({ uri: 'file:///a', kind: 'file' })).toBeUndefined();
  });
});
