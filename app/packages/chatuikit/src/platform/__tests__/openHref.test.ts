import { Linking } from 'react-native';

import { normalizeHref, openHref } from '../openHref';

describe('normalizeHref', () => {
  it('keeps schemed links, adds https to bare hosts, refuses junk', () => {
    expect(normalizeHref('https://knf.vu.lt/a')).toBe('https://knf.vu.lt/a');
    expect(normalizeHref('mailto:a@b.lt')).toBe('mailto:a@b.lt');
    expect(normalizeHref('tel:+37060000000')).toBe('tel:+37060000000');
    expect(normalizeHref('knf.vu.lt/naujienos')).toBe('https://knf.vu.lt/naujienos');
    expect(normalizeHref('  www.vu.lt  ')).toBe('https://www.vu.lt');
    expect(normalizeHref('')).toBeNull();
    expect(normalizeHref('just words')).toBeNull();
  });
});

describe('openHref', () => {
  it('opens http/mailto/tel without asking, asks for other schemes, reports failure', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const can = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const fail = jest.fn();
    expect(await openHref('knf.vu.lt', fail)).toBe(true);
    expect(open).toHaveBeenLastCalledWith('https://knf.vu.lt');
    expect(can).not.toHaveBeenCalled();
    expect(await openHref('myapp://room/1', fail)).toBe(false);
    expect(fail).toHaveBeenCalledWith('myapp://room/1');
    open.mockRejectedValueOnce(new Error('no'));
    expect(await openHref('https://x.lt', fail)).toBe(false);
    expect(await openHref('', fail)).toBe(false);
    open.mockRestore();
    can.mockRestore();
  });
});
