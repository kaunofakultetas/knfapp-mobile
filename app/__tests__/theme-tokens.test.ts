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


// The config's source text, scanned below
const tailwindSource = readFileSync(join(__dirname, '..', 'tailwind.config.js'), 'utf8');

// Every var(--x) literal written anywhere in tailwind.config.js
const referencedVariables = [...tailwindSource.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);


it('references at least one CSS variable (regex guard)', () => {
  expect(referencedVariables.length).toBeGreaterThan(0);
});

it.each([...new Set(referencedVariables)])('%s exists in the generated palette variables', (name) => {
  expect(Object.keys(cssVariables(palettes.light))).toContain(name);
});


// The text/fill split (KNF-131): text-brand must resolve to the
// AA-checked brandText, bg-danger to dangerFill — while the
// border and soft-wash utilities keep the base tokens. A config
// edit that drops the split would put the 3.1–3.9:1 brand pink
// back on every text-brand label in dark mode
describe('text and fill utilities part ways where one hex cannot serve both', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require('../tailwind.config.js') as {
    theme: { extend: Record<string, Record<string, Record<string, string> | string>> };
  };
  const extend = config.theme.extend;

  it('text-brand is brand-as-text; text-brand-fill is the fill hue for on-brand pills', () => {
    expect(extend.textColor.brand).toEqual({ DEFAULT: 'var(--brand-text)', fill: 'var(--brand)' });
  });

  it('bg-danger is the fill a white label sits on', () => {
    expect(extend.backgroundColor.danger).toEqual({ DEFAULT: 'var(--danger-fill)' });
  });

  it('the base color table still maps brand and danger to their own variables', () => {
    const colors = extend.colors as Record<string, Record<string, string>>;
    expect(colors.brand.DEFAULT).toBe('var(--brand)');
    expect(colors.danger.DEFAULT).toBe('var(--danger)');
  });
});
