// -----------------------------------------------------------
//  [*] Tests — the backend's machine codes reach the catalog
//
//  The backend publishes stable error codes; a code the
//  catalogs do not know falls through apiErrorKey to a
//  per-status guess, and that guess is where failure identity
//  died: a refused username became "Invalid invitation code",
//  a full storage quota (413 quota_exceeded) became "The file
//  is too large". Pinned here: every code a screen can meet
//  has a sentence in BOTH catalogs, the two catalogs carry the
//  same code set, and apiErrorKey resolves the codes through
//  the real catalogs ahead of any override or status.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The app's i18n singleton, rebuilt from the REAL catalogs so
// exists() answers for what is actually shipped
jest.mock('@/i18n', () => {
  const { createInstance } = require('i18next');
  const lt = require('@/i18n/lt.json');
  const en = require('@/i18n/en.json');
  const instance = createInstance();
  void instance.init({
    lng: 'lt',
    fallbackLng: 'lt',
    resources: { lt: { translation: lt }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return { __esModule: true, default: instance, deviceLanguage: 'lt' };
});

import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';
import { ApiError } from '@/services/api/client';
import { apiErrorKey } from '@/services/api/errors';


// The codes the backend answers the screens' own requests
// with (grep code="…" in django/knfapp) — the wayfind and
// admin editors' codes are out of scope here
const SCREEN_CODES = [
  // auth / register
  'invalid_credentials', 'account_deactivated', 'rate_limited', 'username_taken',
  'invalid_username', 'invalid_email',
  'password_too_short', 'password_too_long', 'password_contains_username',
  'password_contains_email', 'password_too_common',
  'invite_invalid', 'invite_expired', 'invite_exhausted',
  // uploads (avatar, post image, chat file, meme)
  'no_file', 'empty_file', 'file_too_large', 'bad_file_type', 'bad_file_content',
  'quota_exceeded', 'upload_not_owned', 'still_referenced',
  // social
  'friend_request_cooldown',
];

const httpError = (status: number, serverCode?: string) =>
  new ApiError('Backend text', status, 'http', undefined, serverCode);


describe('errors.codes catalog', () => {
  it.each(SCREEN_CODES)('%s has a sentence in both catalogs', (code) => {
    expect(typeof lt.errors.codes[code as keyof typeof lt.errors.codes]).toBe('string');
    expect(typeof en.errors.codes[code as keyof typeof en.errors.codes]).toBe('string');
  });

  it('the two catalogs carry the same code set', () => {
    expect(Object.keys(en.errors.codes).sort()).toEqual(Object.keys(lt.errors.codes).sort());
  });
});


describe('apiErrorKey against the real catalogs', () => {
  it('a full storage quota (413 quota_exceeded) is the quota sentence, not "too large"', () => {
    expect(apiErrorKey(httpError(413, 'quota_exceeded'))).toBe('errors.codes.quota_exceeded');
  });

  it('an oversize file (400 file_too_large) names the size', () => {
    expect(apiErrorKey(httpError(400, 'file_too_large'))).toBe('errors.codes.file_too_large');
  });

  it("a refused username or e-mail beats the register screen's 400 → invitation-code override", () => {
    const overrides = { 400: 'register.invalidCode' };
    expect(apiErrorKey(httpError(400, 'invalid_username'), overrides)).toBe('errors.codes.invalid_username');
    expect(apiErrorKey(httpError(400, 'invalid_email'), overrides)).toBe('errors.codes.invalid_email');
  });

  it("a declined request's cooldown (429) is its own sentence, not the rate-limit copy", () => {
    expect(apiErrorKey(httpError(429, 'friend_request_cooldown'))).toBe('errors.codes.friend_request_cooldown');
  });

  it('the two codes shipped with the upload ownership guard resolve', () => {
    expect(apiErrorKey(httpError(400, 'upload_not_owned'))).toBe('errors.codes.upload_not_owned');
    expect(apiErrorKey(httpError(409, 'still_referenced'))).toBe('errors.codes.still_referenced');
  });
});
