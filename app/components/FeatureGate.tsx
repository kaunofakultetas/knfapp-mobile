// -----------------------------------------------------------
//  [*] FeatureGate — the route-level shipping gate
//
//  Wraps a route's component so a module that features.json
//  ships DISABLED renders a calm "not ready yet" screen
//  instead of the real thing. The gated component is never
//  MOUNTED while off — its fetches, sockets and effects never
//  run — which is why this is a wrapper around the export and
//  not a conditional inside the screen. Flags are build
//  constants, so the branch is decided once per build; the
//  normal path costs one boolean read.
//
//  The gate is the second line of defence: disabled tabs are
//  not registered at all and entry points hide, so this
//  screen appears only on a stale deep link or a missed
//  entry-point gate — reachable, never broken.
//
//  Split into (root component last):
//
//    FeatureUnavailable — the "not ready yet" screen
//    withFeature        — the export wrapper (default export)
// -----------------------------------------------------------

import { EmptyState, Screen } from '@/components/ui';
import { isFeatureEnabled, type FeatureKey } from '@/services/features';

import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';







// -----------------------------------------------------------
// FeatureUnavailable
// -----------------------------------------------------------
//
// The calm face of a gated route: the shared empty-state
// layout with a "still being prepared" line — deliberately
// not an error, because nothing failed.
//
// Used by:
//   - withFeature (below)
// -----------------------------------------------------------

function FeatureUnavailable() {

  const { t } = useTranslation();


  return (
    <Screen>
      <EmptyState
        icon="construct-outline"
        title={t('common.featureUnavailableTitle')}
        hint={t('common.featureUnavailableHint')}
      />
    </Screen>
  );
}







// -----------------------------------------------------------
// withFeature (default export)
// -----------------------------------------------------------
//
//   export default withFeature('chat', ChatRoomScreen);
//
// The one-line gate every shippable module's stack routes
// close their file with — the wrapped screen mounts only
// while its flag is on.
//
// Used by:
//   - app/(main)/chat-room, new-chat — 'chat'
//   - app/(main)/news-post — 'news'
//   - app/(main)/news-comments, create-post, friends,
//     friend-requests, activity, profile — 'social' (the
//     news UGC surface ships with the social module)
//   - app/(main)/map-editor/{index,capture,align} — 'map'
// -----------------------------------------------------------

export default function withFeature<P extends object>(
  feature: FeatureKey,
  Component: ComponentType<P>,
): ComponentType<P> {
  if (isFeatureEnabled(feature)) return Component;
  return FeatureUnavailable;
}
