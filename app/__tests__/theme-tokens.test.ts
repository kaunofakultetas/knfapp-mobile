// -----------------------------------------------------------
//  [*] Tests — theme token contract
//
//  tailwind.config.js hard-codes var(--…) literals against the
//  variable names cssVariables() derives from Palette keys at
//  runtime. Nothing else links the two sides: an unresolved
//  CSS variable is silently dropped, so renaming a Palette key
//  is compiler-clean but leaves every class on the old token
//  rendering with no color. This test pins the contract.
// -----------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';

import { cssVariables, palettes } from '@/constants/theme';


// Every var(--x) literal written anywhere in tailwind.config.js
const tailwindSource = readFileSync(join(__dirname, '..', 'tailwind.config.js'), 'utf8');
const referencedVariables = [...tailwindSource.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);


it('references at least one CSS variable (regex guard)', () => {
  expect(referencedVariables.length).toBeGreaterThan(0);
});

it.each([...new Set(referencedVariables)])('%s exists in the generated palette variables', (name) => {
  expect(Object.keys(cssVariables(palettes.light))).toContain(name);
});
