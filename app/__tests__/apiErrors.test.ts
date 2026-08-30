// -----------------------------------------------------------
//  [*] Tests — apiErrorKey resolution order
//
//  The contract screens rely on to never render raw backend
//  text: serverCode catalog keys win, then the caller's
//  per-status overrides, then generic errors.http.<status>,
//  then transport keys, then errors.generic — and non-ApiError
//  values always land on errors.generic.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Only errors.codes.* keys the test declares "exist" resolve
const mockKnownCodeKeys = new Set([
  'errors.codes.invalid_credentials',
  'errors.codes.rate_limited',
]);
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'lt',
    exists: (key: string) => mockKnownCodeKeys.has(key),
    t: (key: string) => key,
    changeLanguage: async () => {},
  },
  deviceLanguage: 'lt',
}));

import { apiErrorKey } from '@/services/api/errors';
import { ApiError } from '@/services/api/client';


const httpError = (status: number, serverCode?: string) =>
  new ApiError('Backend text', status, 'http', undefined, serverCode);


describe('apiErrorKey', () => {
  it('prefers the serverCode catalog key when the catalogs know it', () => {
    expect(apiErrorKey(httpError(401, 'invalid_credentials'))).toBe(
      'errors.codes.invalid_credentials',
    );
  });

  it('beats overrides with a known serverCode', () => {
    expect(apiErrorKey(httpError(429, 'rate_limited'), { 429: 'login.tooMany' })).toBe(
      'errors.codes.rate_limited',
    );
  });

  it('falls through an unknown serverCode to the override', () => {
    expect(apiErrorKey(httpError(409, 'weird_new_code'), { 409: 'register.usernameTaken' })).toBe(
      'register.usernameTaken',
    );
  });

  it('uses the generic per-status key without overrides', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 429, 500]) {
      expect(apiErrorKey(httpError(status))).toBe(`errors.http.${status}`);
    }
  });

  it('drops unmapped statuses to errors.generic', () => {
    expect(apiErrorKey(httpError(502))).toBe('errors.generic');
    expect(apiErrorKey(httpError(418))).toBe('errors.generic');
  });

  it('maps transport failures to their own keys', () => {
    expect(apiErrorKey(new ApiError('timed out', 0, 'timeout'))).toBe('errors.timeout');
    expect(apiErrorKey(new ApiError('offline', 0, 'network'))).toBe('errors.network');
  });

  it('lands every non-ApiError on errors.generic', () => {
    expect(apiErrorKey(new Error('plain'))).toBe('errors.generic');
    expect(apiErrorKey('string')).toBe('errors.generic');
    expect(apiErrorKey(undefined)).toBe('errors.generic');
  });
});
