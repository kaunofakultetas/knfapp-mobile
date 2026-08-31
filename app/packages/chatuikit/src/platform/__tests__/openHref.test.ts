// -----------------------------------------------------------
//  [*] Tests — the link door, pinned
//
//  The safety contract production clients converge on: a bare
//  host gets https://, real schemes pass untouched (mailto,
//  tel, ftp, custom-with-digits), garbage is refused before
//  the OS sees it, a custom scheme is asked about first and a
//  "no" reaches the host's callback instead of vanishing.
// -----------------------------------------------------------

import { Linking } from 'react-native';

import { normalizeHref, openHref } from '../openHref';

// Linking's methods are already jest mocks in this preset, so a
// spy shares their call history — clear it between tests
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('normalizeHref', () => {
  it('walks the scheme matrix', () => {
    expect(normalizeHref('https://knf.vu.lt')).toBe('https://knf.vu.lt');
    expect(normalizeHref('http://knf.vu.lt')).toBe('http://knf.vu.lt');
    expect(normalizeHref('knf.vu.lt/naujienos')).toBe('https://knf.vu.lt/naujienos');
    expect(normalizeHref('mailto:pagalba@knf.vu.lt')).toBe('mailto:pagalba@knf.vu.lt');
    expect(normalizeHref('tel:+37061234567')).toBe('tel:+37061234567');
    expect(normalizeHref('ftp://failai.knf.vu.lt')).toBe('ftp://failai.knf.vu.lt');
    expect(normalizeHref('web+app1:kelias')).toBe('web+app1:kelias');
  });

  it('refuses what no browser should see', () => {
    expect(normalizeHref('')).toBeNull();
    expect(normalizeHref('   ')).toBeNull();
    expect(normalizeHref('tik tekstas')).toBeNull();
  });
});

describe('openHref', () => {
  it('opens http(s) without interrogating the OS and prepends the scheme for a bare host', async () => {
    const can = jest.spyOn(Linking, 'canOpenURL');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    expect(await openHref('knf.vu.lt/naujienos')).toBe(true);
    expect(can).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('https://knf.vu.lt/naujienos');
  });

  it('asks the OS about a custom scheme and hands a refusal to the callback', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    const onFail = jest.fn();
    expect(await openHref('scrn://team-chat', onFail)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledWith('scrn://team-chat');
  });

  it('turns garbage and a throwing OS into callbacks, never rejections', async () => {
    const onFail = jest.fn();
    expect(await openHref('visai ne nuoroda', onFail)).toBe(false);
    expect(onFail).toHaveBeenCalledWith('visai ne nuoroda');

    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const onFail2 = jest.fn();
    expect(await openHref('https://knf.vu.lt', onFail2)).toBe(false);
    expect(onFail2).toHaveBeenCalledWith('https://knf.vu.lt');
  });
});
