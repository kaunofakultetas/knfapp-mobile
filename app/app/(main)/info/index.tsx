// -----------------------------------------------------------
//  [*] Info — the faculty handbook
//
//  Contacts, opening hours, useful links, study programs and
//  the FAQ accordion, all served per language — switching the
//  app language refetches and never lets the other language's
//  content linger. Works fully logged out.
//
//  Offline story: every successful fetch is cached per
//  language (cacheKeyInfo). A failed load falls back to that
//  language's cache with the CachedBanner on top; live data
//  already on screen for the CURRENT language survives a
//  failed refresh untouched. The live-language marker resets
//  on every language switch, so a stale marker can never
//  suppress the cache fallback for the new language (the old
//  screen silently kept Lithuanian content after an offline
//  switch to English).
//
//  Section arrays are read defensively — an older cached
//  payload may omit whole sections, and an empty section is
//  simply not rendered. Backend strings arrive already
//  entity-decoded by the api client.
//
//  Split into (root component last):
//
//    ICON_MAP        — backend icon names → Ionicons glyphs
//    Section         — SectionTitle + spacing wrapper
//    FacultyCard     — burgundy header card + general contact
//    ContactsSection — grouped contact cards, tel/mailto rows
//    HoursSection    — opening-hours cards
//    LinksSection    — external link rows
//    ProgramsSection — study program cards
//    FaqItem         — one accordion question
//    FaqSection      — the FAQ accordion
//    InfoScreen      — load / cache / language (default export)
// -----------------------------------------------------------

// The stale-data strip over cache-served content
import CachedBanner from '@/components/CachedBanner';

// UI kit — cards, section labels, the data states
import { Card, ErrorState, LoadingSpinner, Screen, SectionTitle } from '@/components/ui';

// Active language drives fetch, cache key and refetch
import { useApp } from '@/context/AppContext';

// Non-blocking feedback for failed link opens
import { showToast } from '@/context/NetworkContext';

// Refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// JS-side colors — icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// The handbook endpoint and its payload shapes
import {
  fetchFacultyInfo,
  type FacultyInfoResponse,
  type InfoContactCategory,
  type InfoFaq,
  type InfoGeneralContact,
  type InfoHours,
  type InfoLink,
  type InfoProgram,
} from '@/services/api';

// Per-language offline cache
import { cacheGet, cacheKeyInfo, cacheSet, INFO_CACHE_MAX_AGE } from '@/services/cache';

// Clipboard hand-off when a link has no handler
import * as Clipboard from 'expo-clipboard';

// Icons, linking, scroll primitives
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';


// FAQ rows are hand-rolled Pressables (Card cannot carry the
// expanded a11y state), so they borrow the ui Card's exact
// shadow to sit in the same visual deck; '#000' is the
// sanctioned shadow exception
const FAQ_ROW_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 1,
};







// -----------------------------------------------------------
// telUrl / mailtoUrl / copyValue
// -----------------------------------------------------------
//
// Strict link builders: backend contact values arrive as
// display strings ("(8 37) 422 523", names with spaces), so
// tel: keeps only digits and '+' and the mailto local part is
// percent-encoded — a raw space would make openURL reject a
// perfectly good contact. copyValue reverses the build for
// the clipboard fallback when no handler exists.
//
// Used by:
//   - FacultyCard, ContactsSection (below) — the contact rows
//   - InfoScreen (below) — the openLink clipboard fallback
// -----------------------------------------------------------

const telUrl = (phone: string | undefined): string =>
  `tel:${(phone ?? '').replace(/[^+\d]/g, '')}`;

const mailtoUrl = (email: string | undefined): string => {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 0) return `mailto:${encodeURIComponent(value)}`;
  return `mailto:${encodeURIComponent(value.slice(0, at))}@${value.slice(at + 1)}`;
};

const copyValue = (url: string): string => {
  if (/^tel:/i.test(url)) return url.slice(4);
  if (/^mailto:/i.test(url)) {
    try {
      return decodeURIComponent(url.slice(7));
    } catch {
      return url.slice(7);
    }
  }
  return url;
};







// -----------------------------------------------------------
// ICON_MAP
// -----------------------------------------------------------
//
// The backend names link icons loosely ("globe", "school");
// unknown names fall back to link-outline at the call site.
//
// Used by:
//   - LinksSection (below)
// -----------------------------------------------------------

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  globe: 'globe-outline',
  school: 'school-outline',
  laptop: 'laptop-outline',
  mail: 'mail-outline',
  book: 'book-outline',
  library: 'library-outline',
  'share-social': 'logo-facebook',
  'document-text': 'document-text-outline',
};







// -----------------------------------------------------------
// Section
// -----------------------------------------------------------
//
// Used by:
//   - InfoScreen (below) — every titled block of the page
// -----------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-lg">
      <View className="mb-sm px-xs">
        <SectionTitle>{title}</SectionTitle>
      </View>
      {children}
    </View>
  );
}







// -----------------------------------------------------------
// FacultyCard
// -----------------------------------------------------------
//
// The page opener: a burgundy strip with the university and
// faculty names over the general contact block. The address
// falls back to the bundled i18n string when the payload
// carries no general contact.
//
// Used by:
//   - InfoScreen (below) — first card of the page
// -----------------------------------------------------------

function FacultyCard({
  general,
  onOpen,
}: {
  general?: InfoGeneralContact;
  onOpen: (url: string) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Card padding="none" className="overflow-hidden">

      <View className="bg-brand-header px-lg py-md">
        <Text className="font-raleway-medium text-xs uppercase tracking-widest text-on-brand">
          {t('id.university')}
        </Text>
        <Text className="mt-xs font-raleway-bold text-lg text-on-brand">
          {t('id.faculty')}
        </Text>
      </View>

      <View className="gap-sm px-lg py-md">

        <View className="flex-row items-center gap-sm">
          <Ionicons name="location-outline" size={16} color={colors.inkSoft} />
          <Text className="flex-1 font-raleway text-sm text-ink-soft">
            {general?.address || t('info.address')}
          </Text>
        </View>

        {general?.phone ? (
          <Pressable
            className="flex-row items-center gap-sm"
            onPress={() => onOpen(telUrl(general.phone))}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel={general.phone}
          >
            <Ionicons name="call-outline" size={16} color={colors.brand} />
            <Text className="font-raleway-medium text-sm text-brand">{general.phone}</Text>
          </Pressable>
        ) : null}

        {general?.email ? (
          <Pressable
            className="flex-row items-center gap-sm"
            onPress={() => onOpen(mailtoUrl(general.email))}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel={general.email}
          >
            <Ionicons name="mail-outline" size={16} color={colors.brand} />
            <Text className="font-raleway-medium text-sm text-brand">{general.email}</Text>
          </Pressable>
        ) : null}

      </View>

    </Card>
  );
}







// -----------------------------------------------------------
// ContactsSection
// -----------------------------------------------------------
//
// Categories of contact cards. Keys are index-composited —
// staff lists can realistically repeat a name within one
// category, and content fields alone would collide.
//
// Used by:
//   - InfoScreen (below)
// -----------------------------------------------------------

function ContactsSection({
  contacts,
  onOpen,
}: {
  contacts: InfoContactCategory[];
  onOpen: (url: string) => void;
}) {

  const { colors } = useTheme();


  return (
    <View>
      {contacts.map((category, categoryIndex) => (
        <View
          key={`${categoryIndex}-${category.category}`}
          className={categoryIndex > 0 ? 'mt-md' : undefined}
        >

          <Text className="mb-sm px-xs font-raleway-semibold text-sm text-ink-soft">
            {category.category}
          </Text>

          <View className="gap-sm">
            {(category.items ?? []).map((contact, contactIndex) => (
              <Card key={`${contactIndex}-${contact.name}`}>

                <Text className="font-raleway-bold text-base text-ink">{contact.name}</Text>
                {contact.position ? (
                  <Text className="mt-xs font-raleway text-sm text-ink-soft">
                    {contact.position}
                  </Text>
                ) : null}

                {contact.room ? (
                  <View className="mt-sm flex-row items-center gap-xs">
                    <Ionicons name="location-outline" size={14} color={colors.inkSoft} />
                    <Text className="font-raleway text-sm text-ink-soft">{contact.room}</Text>
                  </View>
                ) : null}

                {contact.phone ? (
                  <Pressable
                    className="mt-sm flex-row items-center gap-xs"
                    onPress={() => onOpen(telUrl(contact.phone))}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    accessibilityRole="link"
                    accessibilityLabel={contact.phone}
                  >
                    <Ionicons name="call-outline" size={14} color={colors.brand} />
                    <Text className="font-raleway-medium text-sm text-brand">{contact.phone}</Text>
                  </Pressable>
                ) : null}

                {contact.email ? (
                  <Pressable
                    className="mt-sm flex-row items-center gap-xs"
                    onPress={() => onOpen(mailtoUrl(contact.email))}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    accessibilityRole="link"
                    accessibilityLabel={contact.email}
                  >
                    <Ionicons name="mail-outline" size={14} color={colors.brand} />
                    <Text className="font-raleway-medium text-sm text-brand">{contact.email}</Text>
                  </Pressable>
                ) : null}

              </Card>
            ))}
          </View>

        </View>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// HoursSection
// -----------------------------------------------------------
//
// Used by:
//   - InfoScreen (below)
// -----------------------------------------------------------

function HoursSection({ hours }: { hours: InfoHours[] }) {

  const { colors } = useTheme();


  return (
    <View className="gap-sm">
      {hours.map((entry, index) => (
        <Card key={`${index}-${entry.place}`}>
          <Text className="font-raleway-bold text-base text-ink">{entry.place}</Text>
          <Text className="mt-xs font-raleway text-sm text-ink-soft">{entry.address}</Text>
          <View className="mt-sm flex-row items-center gap-xs">
            <Ionicons name="time-outline" size={14} color={colors.brand} />
            <Text className="font-raleway-medium text-sm text-ink">{entry.schedule}</Text>
          </View>
          {entry.note ? (
            <Text className="mt-xs font-raleway text-xs text-ink-soft">{entry.note}</Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// LinksSection
// -----------------------------------------------------------
//
// Used by:
//   - InfoScreen (below)
// -----------------------------------------------------------

function LinksSection({
  links,
  onOpen,
}: {
  links: InfoLink[];
  onOpen: (url: string) => void;
}) {

  const { colors } = useTheme();


  return (
    <View className="gap-sm">
      {links.map((link, index) => (
        <Card key={`${index}-${link.url}`} onPress={() => onOpen(link.url)}>
          <View className="flex-row items-center gap-md">
            <View className="h-9 w-9 items-center justify-center rounded-md bg-brand-soft">
              <Ionicons name={ICON_MAP[link.icon] ?? 'link-outline'} size={20} color={colors.brand} />
            </View>
            <Text className="flex-1 font-raleway-medium text-base text-ink">{link.title}</Text>
            <Ionicons name="open-outline" size={16} color={colors.inkFaint} />
          </View>
        </Card>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// ProgramsSection
// -----------------------------------------------------------
//
// Used by:
//   - InfoScreen (below)
// -----------------------------------------------------------

function ProgramsSection({ programs }: { programs: InfoProgram[] }) {
  return (
    <View className="gap-sm">
      {programs.map((program, index) => (
        <Card key={`${index}-${program.name}`}>
          <Text className="font-raleway-bold text-base text-ink">{program.name}</Text>
          <View className="mt-sm flex-row items-center gap-sm">
            <View className="rounded-md bg-brand-soft px-sm py-xs">
              <Text className="font-raleway-bold text-xs text-brand">{program.degree}</Text>
            </View>
            <Text className="font-raleway text-sm text-ink-soft">{program.duration}</Text>
          </View>
        </Card>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// FaqItem
// -----------------------------------------------------------
//
// One accordion row. A hand-rolled Pressable instead of Card
// so it can expose accessibilityState.expanded; the pressed
// tint and shadow mirror Card's.
//
// Used by:
//   - FaqSection (below)
// -----------------------------------------------------------

function FaqItem({
  item,
  expanded,
  onToggle,
}: {
  item: InfoFaq;
  expanded: boolean;
  onToggle: () => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      // The answer must live in the label — screen readers
      // never reach the conditional answer Text below
      accessibilityLabel={expanded ? `${item.q}. ${item.a}` : item.q}
      accessibilityState={{ expanded }}
      className="rounded-xl bg-surface p-md"
      style={({ pressed }) =>
        pressed ? [FAQ_ROW_SHADOW, { backgroundColor: colors.surfaceSoft }] : FAQ_ROW_SHADOW
      }
    >

      <View className="flex-row items-center justify-between gap-sm">
        <Text className="flex-1 font-raleway-bold text-base text-ink">{item.q}</Text>
        <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-soft">
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.inkSoft}
          />
        </View>
      </View>

      {expanded && (
        <Text className="mt-md border-t border-line pt-md font-raleway text-sm leading-5 text-ink-soft">
          {item.a}
        </Text>
      )}

    </Pressable>
  );
}







// -----------------------------------------------------------
// FaqSection
// -----------------------------------------------------------
//
// Used by:
//   - InfoScreen (below)
// -----------------------------------------------------------

function FaqSection({ faq }: { faq: InfoFaq[] }) {

  // Expanded rows tracked by question text — a refresh may
  // reorder or trim the payload, and index keys would silently
  // hand an open answer to a different question; several rows
  // may be open at once
  const [expanded, setExpanded] = useState<Set<string>>(new Set());


  const toggle = (question: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  };


  return (
    <View className="gap-sm">
      {faq.map((item, index) => (
        <FaqItem
          key={`${index}-${item.q}`}
          item={item}
          expanded={expanded.has(item.q)}
          onToggle={() => toggle(item.q)}
        />
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// InfoScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /info
//   - app/(main)/tabs/settings.tsx — the faculty info link
// -----------------------------------------------------------

export default function InfoScreen() {

  const { t } = useTranslation();
  const { language, hydrated } = useApp();
  const { colors } = useTheme();


  const [data, setData] = useState<FacultyInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);


  // Which language the shown data was fetched LIVE for; reset
  // on every switch so an old language's success can never
  // suppress the new language's cache fallback
  const liveLang = useRef<string | null>(null);


  // Only the newest request may write — a slow response from
  // before a language switch or refresh is dropped
  const seqRef = useRef(0);


  const load = async (): Promise<void> => {
    const lang = language;
    const seq = ++seqRef.current;
    const key = cacheKeyInfo(lang);

    try {
      const info = await fetchFacultyInfo(lang);
      if (seq !== seqRef.current) return;
      setData(info);
      setCachedAt(null);
      liveLang.current = lang;
      void cacheSet(key, info);
    } catch {
      if (seq !== seqRef.current) return;
      // Live data for THIS language survives a failed refresh;
      // anything else falls back to the per-language cache
      if (liveLang.current !== lang) {
        const cached = await cacheGet<FacultyInfoResponse>(key, INFO_CACHE_MAX_AGE);
        if (seq !== seqRef.current) return;
        if (cached) {
          setData(cached.data);
          setCachedAt(cached.cachedAt);
        } else {
          setData(null);
          setCachedAt(null);
        }
      } else {
        // The kept content is fine, but a pull-to-refresh that
        // failed must still say so
        showToast('error', t('info.loadError'));
      }
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };


  // A language switch is a new resource: spinner, cleared
  // content, cleared live marker — no stale-language flash.
  // Gated on hydration: mounted as the first route (a web
  // reload on /info, a deep link), `language` may still be the
  // pre-hydration placeholder that flips right after mount —
  // waiting avoids fetching the handbook twice and tearing the
  // first copy down mid-read
  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setData(null);
    setCachedAt(null);
    liveLang.current = null;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, language]);


  // Back online: refetch (cache-served content upgrades to live)
  useNetworkRestore(() => {
    void load();
  });


  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };


  // Scheme allowlist: https: for the server-supplied link
  // payloads, plus tel:/mailto: which only ever arrive from
  // the strict builders above — anything else a compromised
  // payload could carry (javascript:, intent:, file:) is
  // refused with the link toast. Opens still reject where no
  // handler exists (emulators, wifi tablets, web); that path
  // hands the value over via the clipboard instead of dying
  // silently
  const openLink = (url: string) => {
    if (!/^(https:|tel:|mailto:)/i.test(url)) {
      showToast('error', t('info.linkError'));
      return;
    }
    Linking.openURL(url).catch(() => {
      Clipboard.setStringAsync(copyValue(url))
        .then(() => showToast('info', t('info.linkCopied')))
        .catch(() => showToast('error', t('info.linkError')));
    });
  };


  if (loading) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (!data) {
    return (
      <Screen>
        <ErrorState
          message={t('info.loadError')}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </Screen>
    );
  }


  // Defensive reads — an older cached payload may omit arrays
  const contacts = data.contacts ?? [];
  const hours = data.hours ?? [];
  const links = data.links ?? [];
  const programs = data.programs ?? [];
  const faq = data.faq ?? [];


  return (
    <Screen>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >

        {cachedAt !== null && (
          <View className="mb-md overflow-hidden rounded-md">
            <CachedBanner cachedAt={cachedAt} />
          </View>
        )}

        <FacultyCard general={data.general_contact} onOpen={openLink} />

        {contacts.length > 0 && (
          <Section title={t('info.contacts')}>
            <ContactsSection contacts={contacts} onOpen={openLink} />
          </Section>
        )}

        {hours.length > 0 && (
          <Section title={t('info.hours')}>
            <HoursSection hours={hours} />
          </Section>
        )}

        {links.length > 0 && (
          <Section title={t('info.links')}>
            <LinksSection links={links} onOpen={openLink} />
          </Section>
        )}

        {programs.length > 0 && (
          <Section title={t('info.programs')}>
            <ProgramsSection programs={programs} />
          </Section>
        )}

        {faq.length > 0 && (
          <Section title={t('info.faq')}>
            <FaqSection faq={faq} />
          </Section>
        )}

      </ScrollView>
    </Screen>
  );
}
