// -----------------------------------------------------------
//  [*] Tests — the KNF adapter contract
//
//  Backend rows exactly as /api/schedule serves them, mapped
//  defensively: scraped data drifts, and a bad row must skip
//  itself, never sink the week.
// -----------------------------------------------------------

import { normalizeKnf, toTimetableEntry, type KnfLesson } from '../index';

const ROW: KnfLesson = {
  id: 17,
  title: 'Matematinė analizė',
  teacher: 'A. Petraitis, B. Jonaitis',
  room: '112, 113',
  timeStart: '09:00',
  timeEnd: '10:30',
  dayOfWeek: 0,
  group: 'ISKS-1',
  semester: '2025-R',
  lectureType: 'Paskaita',
};

describe('toTimetableEntry', () => {
  it('maps the full row', () => {
    const entry = toTimetableEntry(ROW);
    expect(entry).toMatchObject({
      id: '17',
      title: 'Matematinė analizė',
      day: 0,
      startMin: 540,
      endMin: 630,
      people: ['A. Petraitis', 'B. Jonaitis'],
      location: ['112', '113'],
      groupKey: 'ISKS-1',
      termKey: '2025-R',
    });
    // Extra backend fields ride along untouched
    expect(entry.lectureType).toBe('Paskaita');
  });

  it('pads an unpadded "9:00" before the strict parse', () => {
    const entry = toTimetableEntry({ ...ROW, timeStart: '9:00' });
    expect(entry.startMin).toBe(540);
  });

  it('empty teacher/room become empty lists; blank title gets a Lithuanian fallback', () => {
    const entry = toTimetableEntry({ ...ROW, teacher: '', room: undefined, title: '  ' });
    expect(entry.people).toEqual([]);
    expect(entry.location).toEqual([]);
    expect(entry.title).toBe('Užsiėmimas');
  });
});

describe('normalizeKnf', () => {
  it('bad rows skip themselves and count; good rows survive', () => {
    const result = normalizeKnf([
      ROW,
      { ...ROW, id: 18, timeStart: 'TBA' },
      { ...ROW, id: 19, timeEnd: '' },
      { ...ROW, id: 20, dayOfWeek: undefined },
      { ...ROW, id: 21, dayOfWeek: 7 },
      { ...ROW, id: 22, timeStart: '10:30', timeEnd: '09:00' },
    ]);
    expect(result.entries.map((e) => e.id)).toEqual(['17']);
    expect(result.skipped).toBe(5);
  });

  it('an empty response is an empty week, not an error', () => {
    expect(normalizeKnf([])).toEqual({ entries: [], skipped: 0 });
  });
});

describe('toTimetableEntry teacher titles', () => {
  it('academic titles riding the comma list are NOT extra people', () => {
    expect(toTimetableEntry({ ...ROW, teacher: 'Aistė Vitkūnė-Bajorinienė, Doc., Dr.' }).people)
      .toEqual(['Aistė Vitkūnė-Bajorinienė']);
    expect(toTimetableEntry({ ...ROW, teacher: 'Eglė Gabrėnaitė, Doc., Dr., Skirmantė Biržietienė, Doc., Dr.' }).people)
      .toEqual(['Eglė Gabrėnaitė', 'Skirmantė Biržietienė']);
    expect(toTimetableEntry({ ...ROW, teacher: 'Jonas Kazlauskas, Prof., Lekt., Asist.' }).people)
      .toEqual(['Jonas Kazlauskas']);
  });

  it('plain multi-teacher lists still split into individual names', () => {
    expect(toTimetableEntry({ ...ROW, teacher: 'A. Petraitis, B. Jonaitis' }).people)
      .toEqual(['A. Petraitis', 'B. Jonaitis']);
  });
});
