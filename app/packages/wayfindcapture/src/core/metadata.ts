// -----------------------------------------------------------
//  [*] wayfindcapture — metadata
//
//  What an imported photo says about itself, read straight
//  from its bytes — no decoder, no dependency. An admin
//  importing a panorama hands the app a file that is one of
//  four things: a full sphere, a partial sphere (a phone's
//  own stitcher crops what it could not cover), a flat sweep
//  strip, or a plain photo — and the staging screen must know
//  WHICH before any pixel is drawn, because each kind gets a
//  different viewer and a different geometry row on the
//  server. The only place that answer lives is the JPEG
//  itself: the SOF segment carries the dimensions, and the
//  XMP APP1 packet carries the spherical-photo vocabulary
//  (ProjectionType, PoseHeadingDegrees, the Full/Cropped
//  pixel rectangle) that stitchers write.
//
//  The XMP is parsed with tolerant regexes over the packet
//  TEXT, not an XML tree: the vocabulary appears in the wild
//  both as attributes on rdf:Description and as child
//  elements, writers bind the panorama namespace to whatever
//  prefix they like (the reader follows the packet's own
//  xmlns declaration, assuming the customary GPano only when
//  none is bound), and a byte-exact XML parser is a
//  dependency this package refuses. Only the STANDARD packet
//  (the APP1 whose header is the xap/1.0 namespace URI) is
//  read; the extended-XMP continuation packets carry bulky
//  payloads (maker previews, depth maps) and never the pano
//  fields, so they are skipped by their different header.
//
//  Nothing here throws. Truncated bytes, a foreign container
//  (PNG / WebP — dimensions best-effort, or zero), random
//  bytes: every input answers a complete result, worst case
//  { 0, 0, photo } — an import flow shows "not a panorama"
//  instead of a crash.
//
//  Used by:
//    - src/index.ts — public surface (the capture barrel
//      re-exports parsePanoMetadata and these types)
//    - the host's import flow on the map-editor screen —
//      picks the viewer, prefills panoGeometry, and seeds
//      panoHeading when PoseHeadingDegrees is present
// -----------------------------------------------------------


export type PanoMetadataKind = 'sphere' | 'partial' | 'sweep' | 'photo';

export interface PanoMetadataGeometry {
  hfovDeg: number;
  vfovDeg: number;
  centreYawDeg: number;
  vOffsetDeg: number;
}

export interface PanoMetadata {
  width: number;
  height: number;
  projectionEquirect: boolean;
  headingDeg: number | null;
  geometry: PanoMetadataGeometry | null;
  kind: PanoMetadataKind;
}

// The APP1 header that marks the standard XMP packet — a
// fixed wire constant of the XMP spec, matched byte-for-byte
// (the extended-XMP continuations carry the '/xmp/extension/'
// namespace URI, which diverges from this '/xap/1.0/' header
// at the xap token, so they fail this match and are skipped)
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\u0000';

// A file whose XMP carries no ProjectionType (or that has no
// XMP at all): treat width/height at least this wide as a
// sweep, and within this fraction of the exact 2:1 equirect
// aspect as a full sphere
const SWEEP_MIN_ASPECT = 2.5;
const SPHERE_ASPECT_TOLERANCE = 0.02;

// A full sphere's geometry is always the whole ball — the
// crop formulas would answer the same numbers for a
// full-coverage crop, so the constant skips the arithmetic
const SPHERE_GEOMETRY: PanoMetadataGeometry = { hfovDeg: 360, vfovDeg: 180, centreYawDeg: 0, vOffsetDeg: 0 };

// The GPano rectangle: full canvas, crop size, crop offset —
// every field a number, all six read before any geometry
const FIELD_FULL_W = 'FullPanoWidthPixels';
const FIELD_FULL_H = 'FullPanoHeightPixels';
const FIELD_CROP_W = 'CroppedAreaImageWidthPixels';
const FIELD_CROP_H = 'CroppedAreaImageHeightPixels';
const FIELD_CROP_LEFT = 'CroppedAreaLeftPixels';
const FIELD_CROP_TOP = 'CroppedAreaTopPixels';







// -----------------------------------------------------------
// parsePanoMetadata
// -----------------------------------------------------------
//
// The one entry point. A JPEG goes through the marker walk
// and the XMP vocabulary; anything else (PNG, WebP, garbage)
// is a plain photo whose dimensions are sniffed best-effort.
// The kind ladder for a JPEG: an equirect ProjectionType
// makes a sphere, or a partial when the crop rectangle is
// complete and genuinely smaller than the full canvas (a
// crop as big as the canvas IS the full sphere, whatever the
// writer bothered to record). With no ProjectionType at all
// the dimensions speak instead — near 2:1 is a sphere the
// stitcher forgot to label, 2.5:1 or wider is a sweep strip
// (hfov a full turn, vfov the strip's own share of it, which
// the aspect floor keeps under the 180 cap by construction).
// Everything else is a photo with no geometry. An explicit
// NON-equirect ProjectionType blocks the dimension
// heuristics: the file told us what it is, and it is not a
// sphere.
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function parsePanoMetadata(bytes: Uint8Array): PanoMetadata {

  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    const { width, height } = sniffForeignDimensions(bytes);
    return { width, height, projectionEquirect: false, headingDeg: null, geometry: null, kind: 'photo' };
  }


  const { width, height, xmp } = scanJpeg(bytes);
  const projection = xmp === null ? null : gpanoText(xmp, 'ProjectionType');
  const projectionEquirect = projection !== null && projection.toLowerCase() === 'equirectangular';
  const headingDeg = xmp === null ? null : gpanoNumber(xmp, 'PoseHeadingDegrees');


  let kind: PanoMetadataKind = 'photo';
  let geometry: PanoMetadataGeometry | null = null;

  if (projectionEquirect && xmp !== null) {
    const crop = readCrop(xmp);
    if (crop !== null) {
      kind = 'partial';
      geometry = crop;
    } else {
      kind = 'sphere';
      geometry = SPHERE_GEOMETRY;
    }
  } else if (projection === null && width > 0 && height > 0) {
    const aspect = width / height;
    if (Math.abs(aspect / 2 - 1) <= SPHERE_ASPECT_TOLERANCE) {
      kind = 'sphere';
      geometry = SPHERE_GEOMETRY;
    } else if (aspect >= SWEEP_MIN_ASPECT) {
      kind = 'sweep';
      geometry = { hfovDeg: 360, vfovDeg: Math.min(180, (360 * height) / width), centreYawDeg: 0, vOffsetDeg: 0 };
    }
  }


  return { width, height, projectionEquirect, headingDeg, geometry, kind };
}







// -----------------------------------------------------------
// scanJpeg
// -----------------------------------------------------------
//
// One pass over the marker stream: SOI is already checked,
// so the walk starts at the first segment and stops at SOS
// (entropy-coded data follows, no more metadata), EOI, or
// the moment the bytes run out — a truncated file simply
// ends the walk with whatever was found. Fill bytes (extra
// 0xFF) before a marker are legal padding and skipped;
// standalone markers (RST, TEM) carry no length. Dimensions
// come from the first SOF0/1/2 — the frame header every
// baseline or progressive JPEG carries exactly once before
// SOS. The XMP text is the FIRST APP1 whose header matches
// the standard packet URI (an Exif APP1 usually comes first
// and fails the match), latin1-decoded so every byte
// round-trips into the regexes unchanged.
//
// Used by:
//   - parsePanoMetadata (above)
// -----------------------------------------------------------

function scanJpeg(bytes: Uint8Array): { width: number; height: number; xmp: string | null } {

  let width = 0;
  let height = 0;
  let xmp: string | null = null;


  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    while (i + 1 < bytes.length && bytes[i + 1] === 0xff) i += 1;
    if (i + 1 >= bytes.length) break;
    const marker = bytes[i + 1];


    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }


    if (i + 4 > bytes.length) break;
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) break;
    const start = i + 4;
    const end = i + 2 + segLen;
    if (end > bytes.length) break;


    // SOF0/1/2 payload: precision byte, then height and width
    // big-endian — height FIRST, the classic transposition trap
    if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && width === 0 && start + 5 <= end) {
      height = (bytes[start + 1] << 8) | bytes[start + 2];
      width = (bytes[start + 3] << 8) | bytes[start + 4];
    }


    if (marker === 0xe1 && xmp === null && matchesAscii(bytes, start, end, XMP_HEADER)) {
      xmp = latin1(bytes, start + XMP_HEADER.length, end);
    }


    i = end;
  }


  return { width, height, xmp };
}







// -----------------------------------------------------------
// readCrop — the GPano rectangle as viewer geometry
// -----------------------------------------------------------
//
// Answers geometry ONLY for a genuine crop: all six rectangle
// numbers present, a positive full canvas, and a crop
// strictly smaller than the canvas on at least one axis.
// Anything less complete — fields missing, a zero canvas, a
// crop covering everything — answers null and the caller
// treats the pano as a full sphere, which is exactly what an
// uncropped equirect is. The mapping: the full canvas spans
// 360 x 180 degrees, so the crop's fractional size scales
// straight into fov, the crop's horizontal centre lands on
// yaw with the canvas's left edge at -180, and the vertical
// centre measures down from the +90 pole — a crop centred on
// the canvas answers centreYaw 0 and vOffset 0.
//
// Used by:
//   - parsePanoMetadata (above)
// -----------------------------------------------------------

function readCrop(xmp: string): PanoMetadataGeometry | null {

  const fullW = gpanoNumber(xmp, FIELD_FULL_W);
  const fullH = gpanoNumber(xmp, FIELD_FULL_H);
  const cropW = gpanoNumber(xmp, FIELD_CROP_W);
  const cropH = gpanoNumber(xmp, FIELD_CROP_H);
  const cropLeft = gpanoNumber(xmp, FIELD_CROP_LEFT);
  const cropTop = gpanoNumber(xmp, FIELD_CROP_TOP);

  if (fullW === null || fullH === null || cropW === null || cropH === null || cropLeft === null || cropTop === null) return null;
  if (fullW <= 0 || fullH <= 0 || cropW <= 0 || cropH <= 0) return null;
  if (cropW >= fullW && cropH >= fullH) return null;


  return {
    hfovDeg: (cropW / fullW) * 360,
    vfovDeg: (cropH / fullH) * 180,
    centreYawDeg: ((cropLeft + cropW / 2) / fullW) * 360 - 180,
    vOffsetDeg: 90 - ((cropTop + cropH / 2) / fullH) * 180,
  };
}







// -----------------------------------------------------------
// panoPrefix — the prefix the packet binds to the vocabulary
// -----------------------------------------------------------
//
// An XML namespace prefix is the writer's free choice: the
// pano vocabulary is identified by its namespace URI (the one
// ending in '/panorama/'), and a packet may bind it to GPano,
// ns1 or anything else in its xmlns declaration. The field
// regexes must use the prefix that is actually bound, so this
// reads it from the declaration — falling back to the
// customary GPano when the packet declares none (some writers
// omit the declaration and use the conventional prefix). The
// answered prefix is regex-escaped: it goes straight into the
// RegExp constructor.
//
// Used by:
//   - gpanoText (below) — once per field lookup
// -----------------------------------------------------------

function panoPrefix(xmp: string): string {

  const bound = /xmlns:([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*["'][^"']*\/panorama\/["']/.exec(xmp);
  return bound ? bound[1].replace(/[.-]/g, '\\$&') : 'GPano';
}







// -----------------------------------------------------------
// gpanoText / gpanoNumber — one field, either XMP shape
// -----------------------------------------------------------
//
// The prefix comes from panoPrefix; 'GPano' below stands for
// whatever the packet bound. The attribute shape
// (GPano:Name="value" on rdf:Description) is tried first — it
// is what most stitchers write — then the element shape
// (<GPano:Name>value</GPano:Name>, attributes on the opening
// tag tolerated, the close tag required to repeat the same
// prefix). Values are trimmed; a number must parse finite or
// the field counts as absent, so one mangled digit cannot
// poison the geometry. The field names fed in are this
// module's own constants and the prefix is escaped — nothing
// user-supplied reaches the RegExp constructor unescaped.
//
// Used by:
//   - parsePanoMetadata, readCrop (above)
// -----------------------------------------------------------

function gpanoText(xmp: string, field: string): string | null {

  const prefix = panoPrefix(xmp);
  const attr = new RegExp(prefix + ':' + field + '\\s*=\\s*["\']([^"\']*)["\']').exec(xmp);
  if (attr) return attr[1].trim();


  const el = new RegExp('<' + prefix + ':' + field + '(?:\\s[^>]*)?>([^<]*)</' + prefix + ':' + field + '\\s*>').exec(xmp);
  if (el) return el[1].trim();

  return null;
}


function gpanoNumber(xmp: string, field: string): number | null {

  const text = gpanoText(xmp, field);
  if (text === null || text === '') return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}







// -----------------------------------------------------------
// sniffForeignDimensions — PNG and WebP, best-effort
// -----------------------------------------------------------
//
// Neither container carries the pano vocabulary the import
// flow needs, so the kind is already settled as 'photo' —
// the dimensions are read only so the staging screen can
// show them. PNG: the IHDR chunk is required to come first,
// width and height as the two big-endian u32s right after
// its tag. WebP: the first chunk after the RIFF/WEBP
// preamble is one of three — VP8X (extended: 24-bit
// little-endian sizes minus one), VP8L (lossless: 14-bit
// sizes minus one packed after the 0x2f signature byte), or
// VP8 (lossy: 14-bit sizes after the 9D 01 2A frame-start
// code). Anything unrecognised answers zero — best-effort
// means never guessing.
//
// Used by:
//   - parsePanoMetadata (above)
// -----------------------------------------------------------

function sniffForeignDimensions(bytes: Uint8Array): { width: number; height: number } {

  // PNG: the eight-byte signature, then the IHDR chunk
  if (bytes.length >= 24 && bytes[0] === 0x89 && matchesAscii(bytes, 1, bytes.length, 'PNG\r\n\u001a\n') && matchesAscii(bytes, 12, bytes.length, 'IHDR')) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }


  // WebP: RIFF preamble, then the first chunk's fourcc
  if (bytes.length >= 30 && matchesAscii(bytes, 0, bytes.length, 'RIFF') && matchesAscii(bytes, 8, bytes.length, 'WEBP')) {

    if (matchesAscii(bytes, 12, bytes.length, 'VP8X')) {
      return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
    }

    if (matchesAscii(bytes, 12, bytes.length, 'VP8L') && bytes[20] === 0x2f) {
      const bits = u32le(bytes, 21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }

    if (matchesAscii(bytes, 12, bytes.length, 'VP8 ') && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
  }


  return { width: 0, height: 0 };
}







// -----------------------------------------------------------
// byte helpers
// -----------------------------------------------------------
//
// The chunked fromCharCode keeps the latin1 decode inside the
// engine's argument limit however large the XMP packet grows;
// latin1 is the one decode where every byte maps to the code
// point of the same value, so the regexes see the packet's
// ASCII exactly and any UTF-8 multibyte noise stays inert.
//
// Used by:
//   - scanJpeg, sniffForeignDimensions (above)
// -----------------------------------------------------------

function latin1(bytes: Uint8Array, start: number, end: number): string {

  let out = '';
  for (let i = start; i < end; i += 4096) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
  }
  return out;
}


function matchesAscii(bytes: Uint8Array, at: number, end: number, text: string): boolean {

  if (at + text.length > end || at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}


function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}


function u32le(bytes: Uint8Array, at: number): number {
  return ((bytes[at + 3] << 24) | (bytes[at + 2] << 16) | (bytes[at + 1] << 8) | bytes[at]) >>> 0;
}


function u24le(bytes: Uint8Array, at: number): number {
  return (bytes[at + 2] << 16) | (bytes[at + 1] << 8) | bytes[at];
}


function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at + 1] << 8) | bytes[at];
}
