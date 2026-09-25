// -----------------------------------------------------------
//  [*] Tests — every catalog key is alive, in both languages
//
//  A key no source names is a string a translator would edit
//  in vain (KNF-185: 36 such keys once sat in the catalogs, 21
//  of them twins of copy a kit draws itself). The scan reads
//  the app's own sources and the kits; a key counts as alive
//  when a source names it literally, or when it sits under a
//  prefix the code builds at run time (t(`errors.codes.${…}`))
//  or that DATA names (a map room's nameKey comes from the
//  building graph). Plural suffixes fold to their base key.
//  schedule.* keeps its own stricter twin-guard in
//  scheduleScreen.test.tsx.
// -----------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';


// The app root the scan starts from
const ROOT = path.resolve(__dirname, '..');

// The dirs whose sources can name a catalog key
const SOURCE_DIRS = ['app', 'components', 'constants', 'context', 'hooks', 'i18n', 'services', 'packages'];

// Dirs never read: tests assert keys, examples demo them
const SKIP = new Set(['node_modules', '__tests__', '__mocks__', 'example', 'coverage']);

// Keys looked up by a prefix the code or the data completes:
// a new dynamic prefix belongs here, with where it is built
const DYNAMIC_PREFIXES = [
  'errors.codes.',          // services/api/errors.ts — t(`errors.codes.${code}`)
  'errors.http.',           // services/api/errors.ts — t(`errors.http.${status}`)
  'mapEditor.issueCodes.',  // map-editor — issue code → sentence
  'mapEditor.kinds.',       // map-editor — entity kind names
  'mapEditor.uploadErrors.', // map-editor — upload refusal codes
  'navigation.rooms.',      // building graph DATA: a room's nameKey
  'tabs.',                  // constants/tabs.ts keys double as tabs.* lookups
];







// -----------------------------------------------------------
// keyPaths
// -----------------------------------------------------------
//
// Every leaf of a catalog as a dotted path, plural suffixes
// folded to their base key.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function keyPaths(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`.replace(/_(zero|one|two|few|many|other)$/, '')],
  );
}







// -----------------------------------------------------------
// sourceText
// -----------------------------------------------------------
//
// The concatenated text of every .ts/.tsx/.js source under the
// scanned dirs, tests and examples excluded.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function sourceText(dir: string): string {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return '';
  return fs.readdirSync(full, { withFileTypes: true }).map((entry) => {
    if (SKIP.has(entry.name)) return '';
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceText(rel);
    return /\.(tsx?|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : '';
  }).join('\n');
}







describe('the i18n catalogs', () => {
  const lt = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'lt.json'), 'utf8')) as Record<string, unknown>;
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'en.json'), 'utf8')) as Record<string, unknown>;

  it('carry the same keys in Lithuanian and English', () => {
    const ltKeys = [...new Set(keyPaths(lt))].sort();
    const enKeys = [...new Set(keyPaths(en))].sort();
    expect(ltKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !ltKeys.includes(key))).toEqual([]);
  });

  it('hold no key that no source names (KNF-185)', () => {
    const text = SOURCE_DIRS.map(sourceText).join('\n');
    const dead = [...new Set(keyPaths(lt))].filter((key) => {
      if (DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !new RegExp(`['"\`]${escaped}['"\`]`).test(text);
    });
    expect(dead).toEqual([]);
  });
});
