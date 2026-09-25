// -----------------------------------------------------------
//  [*] Tests — the declared page language (KNF-129)
//
//  The web build shipped a permanent <html lang="en"> over a
//  Lithuanian UI, so a screen reader read Lithuanian with
//  English rules. The page language now follows every app
//  language change, and the helper stays a harmless no-op
//  wherever no document exists (native, this test runner).
// -----------------------------------------------------------

import i18n, { declareDocumentLanguage } from '@/i18n';







// -----------------------------------------------------------
// withDocument
// -----------------------------------------------------------
//
// The runner has no DOM of its own — a stand-in document the
// languageChanged hook writes through
//
// Used by:
//   - every test below
// -----------------------------------------------------------

const withDocument = () => {
  const root = { lang: '' };
  (globalThis as { document?: unknown }).document = { documentElement: root };
  return root;
};

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});


describe('declareDocumentLanguage', () => {
  it('the page language follows every app language change', async () => {
    const root = withDocument();
    await i18n.changeLanguage('lt');
    expect(root.lang).toBe('lt');
    await i18n.changeLanguage('en');
    expect(root.lang).toBe('en');
  });

  it('is a no-op without a document, and ignores an unset language', () => {
    expect(() => declareDocumentLanguage('lt')).not.toThrow();
    const root = withDocument();
    declareDocumentLanguage(undefined);
    expect(root.lang).toBe('');
  });
});
