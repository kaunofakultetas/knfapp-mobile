// -----------------------------------------------------------
//  [*] chatuikit — openHref
//
//  The one safe way to open what a bubble links to: a bare host
//  gets https://, mailto:/tel:/file paths pass as they are, and
//  the OS is asked whether it can open the URL before it is
//  handed over — a refusal reaches the host as a callback, not
//  a silent failure or an unhandled rejection.
//
//  Split into:
//
//    normalizeHref — pure
//    openHref      — Linking
//
//  Used by:
//    - hosts' onPressLink handlers (the KNF app's chat room)
// -----------------------------------------------------------

import { Linking } from 'react-native';


export function normalizeHref(href: string): string | null {
  const trimmed = (href ?? '').trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  // A bare host or path ("knf.vu.lt/naujienos") — the web is the
  // only sensible default
  if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}


export async function openHref(href: string, onFail?: (href: string) => void): Promise<boolean> {
  const url = normalizeHref(href);
  if (!url) {
    onFail?.(href);
    return false;
  }
  try {
    // canOpenURL lies on Android without a queries manifest entry
    // for custom schemes; http(s) and mailto/tel are always fine
    const supported = /^(https?|mailto|tel):/i.test(url) ? true : await Linking.canOpenURL(url);
    if (!supported) {
      onFail?.(href);
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    onFail?.(href);
    return false;
  }
}
