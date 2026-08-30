// -----------------------------------------------------------
//  [*] New chat — pick people, start a conversation
//
//  Deep-linkable, so the whole screen sits behind
//  LoginRequiredOverlay like the messages tab. Signed in, the
//  flow is: search people (300 ms debounce with a sequence
//  guard, so an out-of-order response can never clobber newer
//  results), toggle them into a chip row — selections are
//  stored as FULL user objects, so chips survive any query
//  change — and create. A failed search keeps the previous
//  hits on screen behind an error + retry row — never a false
//  "no users found".
//
//  Exactly one person selected creates a DIRECT chat and the
//  group-name field is ignored; two or more create a group
//  (named by the field, or by the first names joined). An
//  indicator line above the create button says which will
//  happen, so the switch is never silent. On success the
//  screen replaces itself with the new chat room.
//
//  Profile/friends "message" actions land here with
//  ?prefillUserId&prefillName — that user seeds the selection
//  (avatar/role unknown, defaults render fine).
//
//  Split into (root component last):
//
//    GROUP_EMOJIS  — the random group avatar pool
//    Separator     — stable result-list row separator
//    SelectedChips — removable chips of the picked people
//    UserRow       — one search hit with checkbox semantics
//    NewChatForm   — the signed-in screen body
//    NewChat       — login gate wrapper (default export)
// -----------------------------------------------------------

// Login gate
import LoginRequiredOverlay from '@/components/LoginRequiredOverlay';

// UI kit
import { Avatar, Button, Input } from '@/components/ui';

// Toast feedback and JS-side colors
import { showToast } from '@/context/NetworkContext';
import { useTheme } from '@/hooks/useTheme';

// Keyboard-aware bottom padding for the pinned section
import useKeyboardVisible from '@/hooks/useKeyboardVisible';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// People search + conversation creation
import {
  createConversation,
  searchUsersApi,
  type SearchUserResult,
} from '@/services/api';

// Navigation, keyboard offset, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';


// A fresh group gets a random face from this pool
const GROUP_EMOJIS = ['💬', '👥', '📚', '🧑‍🏫', '🧪', '🖥️', '🧠'];

// Module-level so the results list keeps one stable separator
// component type across renders instead of remounting hairlines
const Separator = () => <View className="h-px bg-line" />;







// -----------------------------------------------------------
// SelectedChips
// -----------------------------------------------------------
//
// The picked people as removable brand-soft chips. Rendering
// from the STORED user objects — not the live search results —
// is what keeps a chip alive after the query moves on.
//
// Used by:
//   - NewChatForm (below)
// -----------------------------------------------------------

function SelectedChips({
  users,
  onRemove,
}: {
  users: SearchUserResult[];
  onRemove: (user: SearchUserResult) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="mb-sm flex-row flex-wrap">
      {users.map((user) => (
        <Pressable
          key={user.id}
          className="mb-xs mr-sm flex-row items-center rounded-full bg-brand-soft px-sm py-xs"
          onPress={() => onRemove(user)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('newChat.removeUser', { name: user.displayName })}
        >
          <Text className="font-raleway-medium text-sm text-brand">{user.displayName}</Text>
          <Ionicons name="close" size={14} color={colors.brand} style={{ marginLeft: 4 }} />
        </Pressable>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// UserRow
// -----------------------------------------------------------
//
// One search hit: checkbox, portrait, name and @username. The
// row IS the checkbox for assistive tech — role + checked
// state live on the Pressable, not on the drawn box.
// Memoised: rows re-render only when their own user/selected
// state changes, not on every keystroke of the query.
//
// Used by:
//   - NewChatForm (below)
// -----------------------------------------------------------

const UserRow = memo(function UserRow({
  user,
  selected,
  onToggle,
}: {
  user: SearchUserResult;
  selected: boolean;
  onToggle: (user: SearchUserResult) => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      className="flex-row items-center py-sm"
      onPress={() => onToggle(user)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={user.displayName}
    >

      <View
        className={`mr-md h-5 w-5 items-center justify-center rounded-sm border ${
          selected ? 'border-brand bg-brand' : 'border-line-strong'
        }`}
      >
        {selected && <Ionicons name="checkmark" size={14} color={colors.onBrand} />}
      </View>

      <Avatar uri={user.avatarUrl} name={user.displayName} size={36} />

      <View className="ml-sm flex-1">
        <Text className="font-raleway-medium text-base text-ink" numberOfLines={1}>
          {user.displayName}
        </Text>
        <Text className="font-raleway text-xs text-ink-soft" numberOfLines={1}>
          @{user.username}
        </Text>
      </View>

    </Pressable>
  );
});







// -----------------------------------------------------------
// NewChatForm
// -----------------------------------------------------------
//
// The signed-in screen body: search state, the stored
// selection, and the create action (see the file header for
// the direct/group rules). The bottom section rides above the
// keyboard — bare 'padding' on iOS, the window's own
// adjustResize on Android — so the create button is never
// hidden. The KeyboardAvoidingView MUST be the screen root:
// its keyboard math reads its own layout frame against the
// window, and nested one level down (inside a SafeAreaView)
// that frame came up short by the header plus the home
// indicator, which is exactly how far the name field ended up
// behind the keys. The bottom inset is therefore applied
// INSIDE, on the pinned section, and only while the keyboard
// is down — with it up the section sits flush on the keys.
//
// Used by:
//   - NewChat (below)
// -----------------------------------------------------------

function NewChatForm() {

  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();
  const { prefillUserId, prefillName } = useLocalSearchParams<{
    prefillUserId?: string;
    prefillName?: string;
  }>();


  // Full user objects, seeded from the prefill params when a
  // profile's "message" action brought the user here
  const [selected, setSelected] = useState<SearchUserResult[]>(() =>
    prefillUserId
      ? [
          {
            id: prefillUserId,
            username: '',
            displayName: prefillName ?? '?',
            role: 'student',
          },
        ]
      : [],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);


  // Debounced search. The sequence is bumped at effect START,
  // so clearing the field or typing on also invalidates any
  // response still in flight — stale results can never land,
  // and a stale finally can never hide the newer spinner. The
  // cleanup bumps it again, so unmount orphans the in-flight
  // response too. A failure keeps the previous results and
  // raises the failed flag; retryNonce re-runs the same query.
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const seq = ++searchSeqRef.current;

    if (!q) {
      setResults([]);
      setSearching(false);
      setFailed(false);
      return;
    }

    setSearching(true);
    setFailed(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await searchUsersApi(q);
          if (seq !== searchSeqRef.current) return;
          setResults(response.users);
        } catch {
          if (seq !== searchSeqRef.current) return;
          setFailed(true);
        } finally {
          if (seq === searchSeqRef.current) setSearching(false);
        }
      })();
    }, 300);

    return () => {
      clearTimeout(timer);
      searchSeqRef.current += 1;
    };
  }, [query, retryNonce]);


  const toggleUser = useCallback((user: SearchUserResult) => {
    setSelected((current) =>
      current.some((u) => u.id === user.id)
        ? current.filter((u) => u.id !== user.id)
        : [...current, user],
    );
  }, []);


  // Stable renderItem + memoised rows: typing in the query box
  // re-renders only rows whose data actually changed
  const renderItem = useCallback(
    ({ item }: { item: SearchUserResult }) => (
      <UserRow
        user={item}
        selected={selected.some((u) => u.id === item.id)}
        onToggle={toggleUser}
      />
    ),
    [selected, toggleUser],
  );


  // Group only from 2+ people; a lone selection is a direct
  // chat no matter what sits in the name field
  const isGroup = selected.length >= 2;


  const createChat = async () => {
    if (selected.length === 0 || creating) return;

    const fallbackTitle = selected
      .map((user) => user.displayName)
      .slice(0, 3)
      .join(', ');
    const title = isGroup ? name.trim() || fallbackTitle : undefined;

    setCreating(true);
    try {
      const { conversationId } = await createConversation({
        participantIds: selected.map((user) => user.id),
        type: isGroup ? 'group' : 'direct',
        title,
        avatarEmoji: isGroup
          ? GROUP_EMOJIS[Math.floor(Math.random() * GROUP_EMOJIS.length)]
          : undefined,
      });
      // Straight into the fresh room; `creating` stays true so
      // the button keeps its spinner through the transition
      router.replace({
        pathname: '/(main)/chat-room',
        params: {
          conversationId,
          title: isGroup ? (title ?? fallbackTitle) : selected[0].displayName,
          // Without the type a fresh group renders as a direct
          // chat until its first page lands
          type: isGroup ? 'group' : 'direct',
        },
      });
    } catch {
      showToast('error', t('newChat.errorMessage'));
      setCreating(false);
    }
  };


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      // Screen ROOT on purpose (see the banner). iOS pads by the
      // bare keyboard height with no header offset — a root-level
      // frame reaches the window bottom (measured on chat-room).
      // Android is inert: the window's own adjustResize lifts
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

        {/* Search + selection + results — the results list
            takes whatever height the keyboard leaves */}
        <View className="flex-1 px-md pt-md">

          <Input
            label={t('newChat.searchUsers')}
            placeholder={t('newChat.searchPlaceholder')}
            leftIcon="search"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {selected.length > 0 && <SelectedChips users={selected} onRemove={toggleUser} />}

          {searching && results.length === 0 ? (
            <View className="items-center py-md">
              <ActivityIndicator size="small" color={colors.brand} />
            </View>
          ) : (
            <View className="flex-1">

              {/* A failed refresh keeps the stale results visible
                  but says so, with a retry that re-runs the query */}
              {failed && (
                <Pressable
                  onPress={() => setRetryNonce((n) => n + 1)}
                  accessibilityRole="button"
                  accessible
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={`${t('common.searchError')}. ${t('common.tryAgain')}`}
                  className="flex-row items-center justify-center py-sm"
                >
                  <Text className="font-raleway text-sm text-danger">{t('common.searchError')}</Text>
                  <Text className="ml-sm font-raleway-medium text-sm text-brand">{t('common.tryAgain')}</Text>
                </Pressable>
              )}

              {/* Refreshing over stale results: dim them and spin
                  so the wait is never mistaken for fresh data */}
              {searching && (
                <View style={{ position: 'absolute', right: 8, top: 8, zIndex: 10 }}>
                  <ActivityIndicator size="small" color={colors.brand} />
                </View>
              )}

              <FlatList
                className="flex-1"
                style={{ opacity: searching ? 0.6 : 1 }}
                data={results}
                keyExtractor={(user) => user.id}
                renderItem={renderItem}
                ItemSeparatorComponent={Separator}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  query.trim() && !searching && !failed ? (
                    <Text
                      accessible
                      accessibilityLiveRegion="polite"
                      className="py-md text-center font-raleway text-sm text-ink-soft"
                    >
                      {t('newChat.noResults')}
                    </Text>
                  ) : null
                }
              />

            </View>
          )}

        </View>

        {/* Name, direct/group indicator and the create button —
            pinned to the bottom, lifted by the keyboard. The
            home-indicator inset pads it only while the keyboard
            is down; up, it sits flush on the keys */}
        <View
          className="border-t border-line bg-surface px-md pt-md"
          style={{ paddingBottom: keyboardUp ? 12 : insets.bottom + 12 }}
        >

          <Input
            label={t('newChat.groupName')}
            placeholder={t('newChat.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={60}
          />

          {selected.length > 0 && (
            <View className="mb-sm flex-row items-center">
              <Ionicons
                name={isGroup ? 'people-outline' : 'person-outline'}
                size={14}
                color={colors.inkSoft}
              />
              <Text className="ml-xs font-raleway text-xs text-ink-soft">
                {isGroup ? t('newChat.groupInfo') : t('newChat.directInfo')}
              </Text>
            </View>
          )}

          <Button
            title={t('newChat.create')}
            onPress={() => void createChat()}
            loading={creating}
            disabled={selected.length === 0}
          />

        </View>

    </KeyboardAvoidingView>
  );
}







// -----------------------------------------------------------
// NewChat (default export)
// -----------------------------------------------------------
//
// The login gate: the route is reachable by deep link while
// logged out, so guests get the same friendly overlay as the
// messages tab instead of a screen whose every search fails.
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/new-chat
// -----------------------------------------------------------

export default function NewChat() {

  const { t } = useTranslation();


  return (
    <LoginRequiredOverlay
      headerTitle={t('newChat.title')}
      icon="chatbubbles-outline"
      message={t('messages.loginRequired')}
      hint={t('messages.loginHint')}
      // This pushed route already gets StackHeader from the stack
      // layout — the overlay must not stack a second burgundy bar
      showHeader={false}
    >
      <NewChatForm />
    </LoginRequiredOverlay>
  );
}
