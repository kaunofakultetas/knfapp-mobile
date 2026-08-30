// -----------------------------------------------------------
//  [*] Tests — roleLabel
//
//  Every screen names roles through this one map; an unknown
//  backend role must degrade to its raw value, never to a
//  blank or a raw i18n key.
// -----------------------------------------------------------

import type { TFunction } from 'i18next';

import { ROLE_KEYS, roleLabel } from '@/constants/roles';


// A t() that proves which catalog key was asked for
const t = ((key: string) => `t(${key})`) as unknown as TFunction;


describe('roleLabel', () => {
  it('translates every known backend role', () => {
    expect(roleLabel(t, 'student')).toBe('t(admin.roleStudent)');
    expect(roleLabel(t, 'teacher')).toBe('t(admin.roleTeacher)');
    expect(roleLabel(t, 'curator')).toBe('t(admin.roleCurator)');
    expect(roleLabel(t, 'admin')).toBe('t(admin.roleAdmin)');
  });

  it('falls back to the raw value for a role the map does not know', () => {
    expect(roleLabel(t, 'superintendent')).toBe('superintendent');
    expect(roleLabel(t, '')).toBe('');
  });

  it('keeps the map and the known roles in sync', () => {
    expect(Object.keys(ROLE_KEYS).sort()).toEqual(['admin', 'curator', 'student', 'teacher']);
  });
});
