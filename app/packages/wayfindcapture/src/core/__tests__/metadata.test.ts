// -----------------------------------------------------------
//  [*] wayfindcapture — metadata.test
//
//  parsePanoMetadata against hand-assembled byte streams — no
//  binary fixtures, every JPEG here is a marker sequence the
//  test builds itself (SOI, an APP1 carrying the XMP text, a
//  SOF0 with the dimensions, EOI), so each case shows exactly
//  which bytes produce which verdict. Both XMP shapes are
//  exercised (attributes on rdf:Description, child elements),
//  plus the ladder's edges: crops that are and are not real,
//  labelled non-spheres, unlabelled 2:1 and sweep strips,
//  extended-XMP continuations, foreign containers, and bytes
//  cut off mid-segment.
//
//  Used by:
//    - npm test / the host's root jest run
// -----------------------------------------------------------

import { parsePanoMetadata } from '../metadata';


// One byte list from marker fragments; Uint8Array at the edge
const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

// A marker segment: FF <marker> <len16 including itself> <body>
const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];

// Baseline frame header: precision 8, height FIRST, one grey component
const sof0 = (w: number, h: number) => seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 0x01, 0x11, 0x00]);

// The standard XMP APP1: namespace URI header, NUL, packet text
const xmpApp1 = (packet: string) => seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii(packet)]);

// An Exif APP1 — same marker, different header, must be skipped
const exifApp1 = () => seg(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]);

// An extended-XMP continuation — its header differs after "/xmp/"
const extendedXmpApp1 = (packet: string) => seg(0xe1, [...ascii('http://ns.adobe.com/xmp/extension/'), 0, ...ascii('0'.repeat(32)), ...ascii(packet)]);

const jpeg = (...parts: number[][]) => bytes([0xff, 0xd8], ...parts, [0xff, 0xd9]);


// The packet shells: same rdf scaffolding real writers emit,
// fields either as attributes or as child elements
const attrPacket = (fields: string) =>
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:GPano="http://ns.example.com/photos/1.0/panorama/" ' +
  fields +
  '/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

const elementPacket = (fields: string) =>
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:GPano="http://ns.example.com/photos/1.0/panorama/">' +
  fields +
  '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

const cropAttrs =
  'GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="8000" GPano:FullPanoHeightPixels="4000" ' +
  'GPano:CroppedAreaImageWidthPixels="4000" GPano:CroppedAreaImageHeightPixels="1500" ' +
  'GPano:CroppedAreaLeftPixels="1000" GPano:CroppedAreaTopPixels="500"';








describe('parsePanoMetadata — equirect XMP, attribute syntax', () => {

  test('full sphere with a pose heading', () => {
    const file = jpeg(
      xmpApp1(attrPacket('GPano:ProjectionType="equirectangular" GPano:PoseHeadingDegrees="203.5"')),
      sof0(8704, 4352),
    );
    const meta = parsePanoMetadata(file);

    expect(meta.kind).toBe('sphere');
    expect(meta.projectionEquirect).toBe(true);
    expect(meta.headingDeg).toBe(203.5);
    expect(meta.width).toBe(8704);
    expect(meta.height).toBe(4352);
    expect(meta.geometry).toEqual({ hfovDeg: 360, vfovDeg: 180, centreYawDeg: 0, vOffsetDeg: 0 });
  });

  test('cropped pano answers partial with the crop mapped to angles', () => {
    const meta = parsePanoMetadata(jpeg(xmpApp1(attrPacket(cropAttrs)), sof0(4000, 1500)));

    expect(meta.kind).toBe('partial');
    expect(meta.projectionEquirect).toBe(true);
    expect(meta.geometry).not.toBeNull();
    expect(meta.geometry!.hfovDeg).toBeCloseTo(180, 6);
    expect(meta.geometry!.vfovDeg).toBeCloseTo(67.5, 6);
    expect(meta.geometry!.centreYawDeg).toBeCloseTo(-45, 6);
    expect(meta.geometry!.vOffsetDeg).toBeCloseTo(33.75, 6);
  });

  test('no PoseHeadingDegrees means headingDeg null, not zero', () => {
    const meta = parsePanoMetadata(jpeg(xmpApp1(attrPacket('GPano:ProjectionType="equirectangular"')), sof0(4096, 2048)));

    expect(meta.kind).toBe('sphere');
    expect(meta.headingDeg).toBeNull();
  });

  test('a crop as large as the canvas is the full sphere', () => {
    const full =
      'GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="4096" GPano:FullPanoHeightPixels="2048" ' +
      'GPano:CroppedAreaImageWidthPixels="4096" GPano:CroppedAreaImageHeightPixels="2048" ' +
      'GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0"';
    const meta = parsePanoMetadata(jpeg(xmpApp1(attrPacket(full)), sof0(4096, 2048)));

    expect(meta.kind).toBe('sphere');
    expect(meta.geometry).toEqual({ hfovDeg: 360, vfovDeg: 180, centreYawDeg: 0, vOffsetDeg: 0 });
  });

  test('an incomplete crop rectangle falls back to the full sphere', () => {
    const partial =
      'GPano:ProjectionType="equirectangular" GPano:FullPanoWidthPixels="8000" ' +
      'GPano:CroppedAreaImageWidthPixels="4000" GPano:CroppedAreaLeftPixels="1000"';
    const meta = parsePanoMetadata(jpeg(xmpApp1(attrPacket(partial)), sof0(4000, 1500)));

    expect(meta.kind).toBe('sphere');
  });

  test('an explicit non-equirect projection blocks the dimension heuristics', () => {
    const meta = parsePanoMetadata(jpeg(xmpApp1(attrPacket('GPano:ProjectionType="cylindrical"')), sof0(4096, 2048)));

    expect(meta.kind).toBe('photo');
    expect(meta.projectionEquirect).toBe(false);
    expect(meta.geometry).toBeNull();
  });
});








describe('parsePanoMetadata — equirect XMP, element syntax', () => {

  test('cropped pano with heading, every field a child element', () => {
    const file = jpeg(
      xmpApp1(
        elementPacket(
          '<GPano:ProjectionType>equirectangular</GPano:ProjectionType>' +
            '<GPano:PoseHeadingDegrees>12.25</GPano:PoseHeadingDegrees>' +
            '<GPano:FullPanoWidthPixels>8000</GPano:FullPanoWidthPixels>' +
            '<GPano:FullPanoHeightPixels>4000</GPano:FullPanoHeightPixels>' +
            '<GPano:CroppedAreaImageWidthPixels>4000</GPano:CroppedAreaImageWidthPixels>' +
            '<GPano:CroppedAreaImageHeightPixels>1500</GPano:CroppedAreaImageHeightPixels>' +
            '<GPano:CroppedAreaLeftPixels>1000</GPano:CroppedAreaLeftPixels>' +
            '<GPano:CroppedAreaTopPixels>500</GPano:CroppedAreaTopPixels>',
        ),
      ),
      sof0(4000, 1500),
    );
    const meta = parsePanoMetadata(file);

    expect(meta.kind).toBe('partial');
    expect(meta.headingDeg).toBe(12.25);
    expect(meta.geometry!.hfovDeg).toBeCloseTo(180, 6);
    expect(meta.geometry!.vfovDeg).toBeCloseTo(67.5, 6);
    expect(meta.geometry!.centreYawDeg).toBeCloseTo(-45, 6);
    expect(meta.geometry!.vOffsetDeg).toBeCloseTo(33.75, 6);
  });

  test('whitespace and attributes on the element tag are tolerated', () => {
    const meta = parsePanoMetadata(
      jpeg(xmpApp1(elementPacket('<GPano:ProjectionType rdf:datatype="x"> equirectangular </GPano:ProjectionType>')), sof0(1024, 512)),
    );

    expect(meta.projectionEquirect).toBe(true);
    expect(meta.kind).toBe('sphere');
  });
});








describe('parsePanoMetadata — no GPano, dimensions decide', () => {

  test('a 4096x1214 strip with no XMP is a sweep', () => {
    const meta = parsePanoMetadata(jpeg(sof0(4096, 1214)));

    expect(meta.kind).toBe('sweep');
    expect(meta.projectionEquirect).toBe(false);
    expect(meta.geometry!.hfovDeg).toBe(360);
    expect(meta.geometry!.vfovDeg).toBeCloseTo((360 * 1214) / 4096, 6);
    expect(meta.geometry!.centreYawDeg).toBe(0);
    expect(meta.geometry!.vOffsetDeg).toBe(0);
  });

  test('an exact 2:1 with no XMP is an unlabelled sphere', () => {
    const meta = parsePanoMetadata(jpeg(sof0(4096, 2048)));

    expect(meta.kind).toBe('sphere');
    expect(meta.geometry).toEqual({ hfovDeg: 360, vfovDeg: 180, centreYawDeg: 0, vOffsetDeg: 0 });
  });

  test('the 2 percent tolerance around 2:1 holds at its edge', () => {
    expect(parsePanoMetadata(jpeg(sof0(4096, 2008))).kind).toBe('sphere');
    expect(parsePanoMetadata(jpeg(sof0(2100, 1000))).kind).toBe('photo');
  });

  test('a 4:3 photo is a photo with no geometry', () => {
    const meta = parsePanoMetadata(jpeg(sof0(4032, 3024)));

    expect(meta.kind).toBe('photo');
    expect(meta.width).toBe(4032);
    expect(meta.height).toBe(3024);
    expect(meta.geometry).toBeNull();
    expect(meta.headingDeg).toBeNull();
  });
});








describe('parsePanoMetadata — packet selection', () => {

  test('an Exif APP1 ahead of the XMP APP1 is skipped, not read', () => {
    const meta = parsePanoMetadata(jpeg(exifApp1(), xmpApp1(attrPacket('GPano:ProjectionType="equirectangular"')), sof0(2048, 1024)));

    expect(meta.kind).toBe('sphere');
    expect(meta.projectionEquirect).toBe(true);
  });

  test('an extended-XMP continuation alone is not the standard packet', () => {
    const meta = parsePanoMetadata(jpeg(extendedXmpApp1(attrPacket('GPano:ProjectionType="equirectangular"')), sof0(4032, 3024)));

    expect(meta.kind).toBe('photo');
    expect(meta.projectionEquirect).toBe(false);
  });

  test('with both packets present only the standard one is read', () => {
    const file = jpeg(
      xmpApp1(attrPacket('GPano:ProjectionType="equirectangular" GPano:PoseHeadingDegrees="90"')),
      extendedXmpApp1(attrPacket('GPano:PoseHeadingDegrees="270"')),
      sof0(2048, 1024),
    );
    const meta = parsePanoMetadata(file);

    expect(meta.headingDeg).toBe(90);
  });
});








describe('parsePanoMetadata — foreign containers and broken bytes', () => {

  test('PNG bytes: dimensions from IHDR, kind photo', () => {
    const meta = parsePanoMetadata(
      bytes(
        [0x89],
        ascii('PNG\r\n'),
        [0x1a, 0x0a],
        [0, 0, 0, 13],
        ascii('IHDR'),
        [0, 0, 0x10, 0x00], // width 4096
        [0, 0, 0x08, 0x00], // height 2048
        [8, 6, 0, 0, 0],
      ),
    );

    expect(meta.kind).toBe('photo');
    expect(meta.width).toBe(4096);
    expect(meta.height).toBe(2048);
    expect(meta.geometry).toBeNull();
  });

  test('WebP VP8X bytes: dimensions from the canvas fields, kind photo', () => {
    const meta = parsePanoMetadata(
      bytes(
        ascii('RIFF'),
        [22, 0, 0, 0],
        ascii('WEBP'),
        ascii('VP8X'),
        [10, 0, 0, 0],
        [0, 0, 0, 0], // flags + reserved
        [0xff, 0x0f, 0x00], // width-1 = 4095
        [0xff, 0x07, 0x00], // height-1 = 2047
      ),
    );

    expect(meta.kind).toBe('photo');
    expect(meta.width).toBe(4096);
    expect(meta.height).toBe(2048);
  });

  test('random bytes answer zero dimensions and photo', () => {
    const meta = parsePanoMetadata(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));

    expect(meta).toEqual({ width: 0, height: 0, projectionEquirect: false, headingDeg: null, geometry: null, kind: 'photo' });
  });

  test('empty bytes and a lone SOI never throw', () => {
    expect(parsePanoMetadata(Uint8Array.from([])).kind).toBe('photo');
    const lone = parsePanoMetadata(Uint8Array.from([0xff, 0xd8, 0xff]));
    expect(lone).toEqual({ width: 0, height: 0, projectionEquirect: false, headingDeg: null, geometry: null, kind: 'photo' });
  });

  test('a segment length past the end of the bytes stops the walk cleanly', () => {
    // APP1 claims 0x0500 bytes but the file ends after four
    const meta = parsePanoMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x05, 0x00, 0x68, 0x74, 0x74, 0x70]));

    expect(meta).toEqual({ width: 0, height: 0, projectionEquirect: false, headingDeg: null, geometry: null, kind: 'photo' });
  });

  test('a file truncated after the XMP still reads the XMP, dimensions zero', () => {
    const whole = jpeg(xmpApp1(attrPacket('GPano:ProjectionType="equirectangular"')), sof0(2048, 1024));
    const cut = whole.subarray(0, whole.length - sof0(2048, 1024).length - 2);
    const meta = parsePanoMetadata(cut);

    expect(meta.projectionEquirect).toBe(true);
    expect(meta.kind).toBe('sphere');
    expect(meta.width).toBe(0);
    expect(meta.height).toBe(0);
  });
});
