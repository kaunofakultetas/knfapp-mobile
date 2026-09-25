// -----------------------------------------------------------
//  [*] Social — Find people (the friends screen's ?view=search)
//
//  The door to someone new. The friends screen listed friends,
//  requests and blocks but offered no way to anyone else — the
//  app's only people search lived in the new-chat picker. This
//  view searches the same directory (GET /chat/users/search: a
//  name or username substring, ranked, at most 20 hits, with
//  deactivated accounts and both halves of a block pair left
//  out) and a tap on a person opens their profile, where the
//  friend request lives.
//
//  A search goes out after a 300 ms typing pause and only from
//  two characters — the server's own floor, below which it
//  answers an empty list without searching, so a shorter query
//  is never sent at all (every call spends the per-user search
//  budget). A sequence number guards the answers: a late
//  response to an older query never replaces a newer one's. A
//  failed search keeps the previous hits on screen under an
//  error row with a retry — never a false "nobody found" — and
//  hits that answer an older query are dimmed until the fresh
//  answer lands.
//
//  Split into (root component last):
//
//    MIN_QUERY        — the server's query floor
//    DEBOUNCE_MS      — the typing pause
//    usePeopleSearch  — the debounced, sequence-guarded search
//    PersonRow        — one hit: portrait, names, chevron
//    SearchErrorRow   — the failed-search row with its retry
//    SearchStatus     — idle hint / spinner / nobody found
//    FindPeopleView   — the view (default export)
// -----------------------------------------------------------

// UI kit and theming
import { Avatar, EmptyState, Input, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// The people directory (the new-chat picker's search)
import { searchUsersApi, type SearchUserResult } from '@/services/api';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Under this many characters the server answers an empty list
// without searching — so a shorter query is not sent at all
const MIN_QUERY = 2;

// The typing pause before a search goes out (new-chat's too)
const DEBOUNCE_MS = 300;







// -----------------------------------------------------------
// usePeopleSearch
// -----------------------------------------------------------
//
//   const search = usePeopleSearch(query);
//   search.results  — the hits on screen (possibly an older
//                     query's, see `settled`)
//   search.ready    — the trimmed query is long enough to send
//   search.settled  — the hits answer the text as typed now
//   search.failed   — the latest search failed (hits kept)
//   search.retry()  — re-run the same query
//
// The sequence is bumped at effect START, so typing on or
// clearing the field also orphans a response still in flight,
// and the cleanup bumps it again, so an unmount does too.
// `answered` is the query the shown hits belong to — "nobody
// found" is said only when THAT is the current text, never in
// the frame between a keystroke and its search starting.
//
// Used by:
//   - FindPeopleView (below)
// -----------------------------------------------------------

function usePeopleSearch(query: string) {

  const [results, setResults] = useState<SearchUserResult[]>([]);
  const [answered, setAnswered] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const seqRef = useRef(0);

  const q = query.trim();
  const ready = q.length >= MIN_QUERY;


  useEffect(() => {
    const seq = ++seqRef.current;

    if (!ready) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the query edit is the event: hits and the error row reset with it
      setResults([]);
      setAnswered(null);
      setFailed(false);
      return;
    }

    setFailed(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { users } = await searchUsersApi(q);
          if (seq !== seqRef.current) return;
          setResults(users);
          setAnswered(q);
        } catch {
          if (seq === seqRef.current) setFailed(true);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      seqRef.current += 1;
    };
  }, [q, ready, retryNonce]);


  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);


  return { results, ready, settled: ready && answered === q, failed, retry };
}







// -----------------------------------------------------------
// PersonRow
// -----------------------------------------------------------
//
// One hit: the portrait, the display name over the @username,
// and a chevron — the whole row (44pt and taller) opens the
// profile. Memoized so typing re-renders only rows whose
// person changed.
//
// Used by:
//   - FindPeopleView (below)
// -----------------------------------------------------------

const PersonRow = memo(function PersonRow({
  item,
  onOpen,
}: {
  item: SearchUserResult;
  onOpen: (person: SearchUserResult) => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      className="min-h-11 flex-row items-center gap-sm border-b border-line py-sm active:bg-surface-soft"
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={item.displayName}
    >
      <Avatar uri={item.avatarUrl} name={item.displayName} size={48} />
      <View className="flex-1">
        <Text className="font-raleway-bold text-base text-ink" numberOfLines={1}>
          {item.displayName}
        </Text>
        <Text className="font-raleway text-xs text-ink-soft" numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </Pressable>
  );
});







// -----------------------------------------------------------
// SearchErrorRow
// -----------------------------------------------------------
//
// Above the (kept) hits when the latest search failed: what
// happened and a retry, one 44pt stop announced the moment it
// appears.
//
// Used by:
//   - FindPeopleView (below) — the list header
// -----------------------------------------------------------

function SearchErrorRow({ onRetry }: { onRetry: () => void }) {

  const { t } = useTranslation();


  return (
    <Pressable
      className="min-h-11 flex-row items-center justify-center gap-sm"
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t('common.searchError')}. ${t('common.tryAgain')}`}
    >
      <Text className="font-raleway text-sm text-danger">{t('common.searchError')}</Text>
      <Text className="font-raleway-medium text-sm text-brand">{t('common.tryAgain')}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// SearchStatus
// -----------------------------------------------------------
//
// What the empty list says: before two characters, how to
// search; while the first answer is on its way, a spinner;
// once the current text is answered with no hits, that nobody
// matched. A failure with nothing to keep says nothing here —
// the error row above carries it.
//
// Used by:
//   - FindPeopleView (below) — the list's empty component
// -----------------------------------------------------------

function SearchStatus({ ready, settled, failed }: { ready: boolean; settled: boolean; failed: boolean }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (!ready) return <EmptyState icon="search-outline" title={t('friends.searchIdle')} />;
  if (failed) return null;
  if (!settled) {
    return (
      <View className="items-center py-lg">
        <ActivityIndicator size="small" color={colors.brand} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }


  return (
    <Text
      accessibilityLiveRegion="polite"
      className="py-lg text-center font-raleway text-sm text-ink-soft"
    >
      {t('friends.searchEmpty')}
    </Text>
  );
}







// -----------------------------------------------------------
// FindPeopleView (default export)
// -----------------------------------------------------------
//
// The search field (focused on arrival — the viewer came here
// to type) over the hits; the stack header is retitled while
// the view shows. The list keeps taps while the keyboard is
// up, and a drag puts the keyboard away; on iOS the content
// insets itself above the keyboard (Android's window resizes).
//
// Used by:
//   - app/(main)/friends/index.tsx — the ?view=search route
// -----------------------------------------------------------

export default function FindPeopleView() {

  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const search = usePeopleSearch(query);


  useEffect(() => {
    navigation.setOptions({ title: t('friends.findPeople') });
  }, [navigation, t]);


  const handleOpen = useCallback(
    (person: SearchUserResult) => router.push({ pathname: '/(main)/profile', params: { userId: person.id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchUserResult }) => <PersonRow item={item} onOpen={handleOpen} />,
    [handleOpen],
  );


  return (
    <Screen>

      <View className="px-md pt-md">
        <Input
          placeholder={t('friends.searchPlaceholder')}
          accessibilityLabel={t('friends.findPeople')}
          leftIcon="search"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          containerClassName="mb-sm"
        />
      </View>

      <FlatList
        data={search.results}
        keyExtractor={(person) => person.id}
        renderItem={renderItem}
        // Hits that answer an older query read as stale
        style={{ opacity: search.settled || search.results.length === 0 ? 1 : 0.6 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        ListHeaderComponent={search.failed ? <SearchErrorRow onRetry={search.retry} /> : null}
        ListEmptyComponent={<SearchStatus ready={search.ready} settled={search.settled} failed={search.failed} />}
      />

    </Screen>
  );
}
