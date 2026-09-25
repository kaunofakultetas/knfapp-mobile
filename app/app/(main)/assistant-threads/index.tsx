// -----------------------------------------------------------
//  [*] Assistant — the conversation history screen
//
//  The AI chat's thread list, pushed from the assistant
//  tab's history button. Route /(main)/assistant-threads —
//  the native stack header carries the title. A "new
//  conversation" row leads the list; below it every stored
//  thread shows its auto-title (the first question) and the
//  age of its last message, with a 44pt trash button per
//  row. Picking a row NAVIGATES back into the assistant tab
//  with the thread id as a param — the tab owns loading the
//  transcript and mounting the runtime on it; this screen
//  only chooses.
//
//  Signed in, the list is the account's server-side list;
//  as a guest it is the device registry looked up against
//  the server (and pruned to what still answers) — both
//  through services/assistantThreads. A focus return
//  refetches silently, so a thread minted by the chat just
//  behind this push appears without a pull; a pull refreshes
//  on demand. A delete is confirmed first and answered with a
//  toast either way — deleted, or kept because the server
//  never saw it.
//
//  Split into (root component last):
//
//    NewThreadRow           — the leading "new" action
//    ThreadRow              — title, age, delete
//    AssistantThreadsScreen — the page (default export)
// -----------------------------------------------------------

// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

// Session state — decides which listing the service uses —
// and the app-wide toast for the delete outcome
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// The thread store client
import {
  deleteThread,
  listThreads,
  type AssistantThreadSummary,
} from '@/services/assistantThreads';

// Single-shot load with silent refreshes
import { useLoad } from '@knf/dataengine';

// UI kit, theming, dates
import { EmptyState, ErrorState, LoadingSpinner, RefreshSpinner, Screen, confirmAction } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatRelativeAgo } from '@/services/format';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';







// -----------------------------------------------------------
// NewThreadRow
// -----------------------------------------------------------
//
// The list's leading action: a brand-tinted row that sends
// the tab back to a fresh chat (param thread=new — the tab
// resets its runtime and mints a server thread lazily on
// the first send).
//
// Used by:
//   - AssistantThreadsScreen (below) — FlatList header
// -----------------------------------------------------------

function NewThreadRow({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="mb-sm mt-md flex-row items-center gap-sm rounded-xl bg-brand p-md active:bg-brand-strong"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('assistant.threadsNew')}
    >
      <Ionicons name="add-circle-outline" size={22} color={colors.onBrand} />
      <Text className="font-raleway-bold text-on-brand">{t('assistant.threadsNew')}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ThreadRow
// -----------------------------------------------------------
//
// One stored conversation, messenger-shaped: the title with
// the age right-aligned beside it, the newest answer's
// first words as the second line (the age moves down there
// — and only there — when no answer landed yet). The title
// area (a 44pt-tall target) opens it in the tab, the
// trailing 44pt trash soft-deletes it. Flat sibling
// Pressables (the friends-row layout) so the screen reader
// gets both actions as their own stops — the open stop reads
// title, preview and age, the trash stop names the
// conversation it deletes. Memoized — a list re-render
// touches only rows whose thread moved.
//
// Used by:
//   - AssistantThreadsScreen (below)
// -----------------------------------------------------------

const ThreadRow = memo(function ThreadRow({
  item,
  onOpen,
  onDelete,
}: {
  item: AssistantThreadSummary;
  onOpen: (thread: AssistantThreadSummary) => void;
  onDelete: (thread: AssistantThreadSummary) => Promise<void> | void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const title = item.title || t('assistant.threadsUntitled');
  const age = formatRelativeAgo(Date.parse(item.lastMessageAt));


  return (
    <View className="flex-row items-center border-b border-line py-sm">

      <Pressable
        className="min-h-11 flex-1 justify-center pr-sm active:opacity-70"
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={[title, item.preview, age].filter(Boolean).join(', ')}
      >
        <View className="flex-row items-center">
          <Text className="flex-1 font-raleway-bold text-base text-ink" numberOfLines={1}>
            {title}
          </Text>
          {item.preview ? (
            <Text className="ml-sm font-raleway text-xs text-ink-faint">{age}</Text>
          ) : null}
        </View>
        <Text className="font-raleway text-xs text-ink-soft" numberOfLines={1}>
          {item.preview ?? age}
        </Text>
      </Pressable>

      {/* w-11 = 44pt — the minimum touch target on its own */}
      <Pressable
        className="h-11 w-11 items-center justify-center rounded-full bg-surface-soft active:opacity-70"
        // The flow awaits a confirm and the server — the press
        // itself hands it off and returns at once
        onPress={() => {
          void onDelete(item);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('assistant.threadsDeleteNamed', { title })}
      >
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </Pressable>

    </View>
  );
});







// -----------------------------------------------------------
// AssistantThreadsScreen (default export)
// -----------------------------------------------------------
//
// One useLoad fetches the list for the current session kind
// (login state re-runs it through the deps); focus returns
// refetch silently past the first, and the local
// `refreshing` flag drives only the pull spinner. Delete is
// honest in order — confirm, the server answers, then the
// list reloads — so a failed delete never hides a live row,
// and a toast says which way it went. One delete at a time:
// a second trash tap while one is in flight is ignored. Row
// selection navigates INTO the tab with the id; the existing
// tab instance picks the param up and swaps its runtime.
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/assistant-threads
// -----------------------------------------------------------

function AssistantThreadsScreen() {

  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();


  const { data, loading, error, refresh, retry } = useLoad<AssistantThreadSummary[]>(
    () => listThreads({ signedIn: isAuthenticated }),
    [isAuthenticated],
  );


  // Silent in-place refetch on every return past the first —
  // the chat behind this push mints threads on first send
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void refresh();
    }, [refresh]),
  );


  // useLoad's refresh is silent — this flag drives only the
  // pull-to-refresh indicator
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);


  // Deleting flips only its own row into the spinner state —
  // the rest of the list stays interactive
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef(false);


  const handleOpen = useCallback(
    (thread: AssistantThreadSummary) => {
      // The nonce makes every tap a distinct param value — the
      // tab consumes each navigation once, so re-opening the
      // same thread works every time
      router.navigate({ pathname: '/(main)/tabs/assistant', params: { thread: thread.id, n: String(Date.now()) } });
    },
    [router],
  );

  const handleNew = useCallback(() => {
    router.navigate({ pathname: '/(main)/tabs/assistant', params: { thread: 'new', n: String(Date.now()) } });
  }, [router]);

  const handleDelete = useCallback(
    async (thread: AssistantThreadSummary) => {
      if (deletingRef.current) return;
      deletingRef.current = true;
      try {
        // One mis-tap next to a scroll must not erase a
        // conversation — destructive, so it asks first
        const confirmed = await confirmAction({
          title: t('assistant.threadsDeleteConfirmTitle'),
          message: t('assistant.threadsDeleteConfirmBody'),
          confirmLabel: t('assistant.threadsDelete'),
          cancelLabel: t('common.cancel'),
          destructive: true,
        });
        if (!confirmed) return;
        setDeletingId(thread.id);
        try {
          await deleteThread(thread.id);
        } catch {
          // The row stays — the honest state for a delete the
          // server never saw — and the student is told so
          showToast('error', t('assistant.threadsDeleteFailed'));
          return;
        }
        showToast('success', t('assistant.threadsDeleted'));
        await refresh();
      } finally {
        deletingRef.current = false;
        setDeletingId(null);
      }
    },
    [refresh, t],
  );


  if (loading) {
    return (
      <Screen>
        <LoadingSpinner />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ErrorState message={t('assistant.threadsError')} onRetry={retry} />
      </Screen>
    );
  }


  return (
    <Screen>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        className="px-lg"
        ListHeaderComponent={<NewThreadRow onPress={handleNew} />}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={t('assistant.threadsEmptyTitle')}
            hint={t('assistant.threadsEmptyBody')}
          />
        }
        renderItem={({ item }) =>
          deletingId === item.id ? (
            <View className="border-b border-line py-sm">
              <LoadingSpinner />
            </View>
          ) : (
            <ThreadRow item={item} onOpen={handleOpen} onDelete={handleDelete} />
          )
        }
        refreshControl={
          <RefreshSpinner
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
          />
        }
      />
    </Screen>
  );
}


// The gate wraps the export, so a disabled module's pushed
// screen never mounts even on a direct navigation
export default withFeature('assistant', AssistantThreadsScreen);
