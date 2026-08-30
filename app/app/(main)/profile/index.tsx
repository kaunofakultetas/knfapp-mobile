// -----------------------------------------------------------
//  [*] Social — Profile screen
//
//  One screen for two audiences: another user's public profile
//  (the friendship state machine + a message shortcut carrying
//  the new-chat prefill params) and the signed-in user's OWN
//  profile (avatar change, friends-list link, per-post
//  delete). Route /(main)/profile?userId=… — pushed from the
//  friends and requests rows; WITHOUT the param it means "my
//  profile", which is what finally makes the own-profile
//  branch reachable; a logged-out visitor there gets a login
//  prompt instead.
//
//  The profile resource is hand-loaded rather than useLoad'ed:
//  friend actions must flip friendshipStatus in place and a
//  404 must render the not-found body while every other
//  failure keeps an ErrorState with retry. A sequence counter
//  drops superseded responses and loading clears on every
//  path. Posts ride useFeed for real pagination (onEndReached)
//  and optimistic own-post deletion with exact revert.
//
//  Avatar uploads persist the RELATIVE upload path — an
//  absolute URL would bake the current host into the DB — and
//  merge the server's updated User into AuthContext (merge,
//  not replace: the response omits the `invited` flag).
//
//  Split into (root component last):
//
//    POSTS_PER_PAGE     — profile feed page size
//    StatBlock          — number-over-caption stat
//    FriendActionButton — one button, four friendship states
//    ProfileHeader      — portrait, identity, stats, actions
//    PostRow            — one post card (+ delete when own)
//    avatarErrorKey     — upload failure → translated message
//    ProfileScreen      — the page itself (default export)
// -----------------------------------------------------------

// Session state and toasts
import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';

// Posts pagination + refetch when connectivity returns
import { useFeed } from '@/hooks/useFeed';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// Backend calls and the normalized error shape
import {
  ApiError,
  acceptFriendRequest,
  deletePost,
  fetchFriendRequests,
  fetchUserPosts,
  fetchUserProfile,
  rejectFriendRequest,
  blockUser,
  reportTarget,
  sendFriendRequest,
  unblockUser,
  unfriendUser,
  updateProfile,
  uploadImageApi,
  type UserProfile,
} from '@/services/api';

// The shared backend-role → label helper
import { roleLabel } from '@/constants/roles';

// UI kit and theming
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Screen,
  confirmAction,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Dates in the active language
import { formatDate } from '@/services/format';

// Domain types
import type { NewsPost } from '@/types';

// Route param normalisation and the login round-trip href
import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouteParam } from '@/hooks/useRouteParam';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Ten posts per page keeps the header visible on first paint;
// onEndReached pages the rest in
const POSTS_PER_PAGE = 10;







// -----------------------------------------------------------
// StatBlock
// -----------------------------------------------------------
//
// Used by:
//   - ProfileHeader (below) — post and friend counts
// -----------------------------------------------------------

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center px-lg">
      <Text className="font-raleway-bold text-lg text-ink">{value}</Text>
      <Text className="font-raleway text-xs text-ink-soft">{label}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// FriendActionButton
// -----------------------------------------------------------
//
// The friendship state machine as one button. Every state is
// actionable — 'request_sent' cancels the pending request, so
// a sent request is never a dead end. The Button's spinner
// inherits the variant's label color, which keeps it visible
// on the brand background.
//
// Used by:
//   - ProfileHeader (below)
// -----------------------------------------------------------

function FriendActionButton({
  status,
  loading,
  onPress,
}: {
  status: UserProfile['friendshipStatus'];
  loading: boolean;
  onPress: () => void;
}) {

  const { t } = useTranslation();


  if (status === 'friends') {
    return (
      <Button
        title={t('profile.unfriend')}
        onPress={onPress}
        variant="secondary"
        loading={loading}
      />
    );
  }


  if (status === 'request_sent') {
    return (
      <Button
        title={t('profile.cancelRequest')}
        onPress={onPress}
        variant="secondary"
        loading={loading}
      />
    );
  }


  if (status === 'request_received') {
    return <Button title={t('profile.acceptRequest')} onPress={onPress} loading={loading} />;
  }


  return (
    <Button
      title={t('profile.addFriend')}
      onPress={onPress}
      leftIcon="person-add-outline"
      loading={loading}
    />
  );
}







// -----------------------------------------------------------
// ProfileHeader
// -----------------------------------------------------------
//
// Everything above the post list: the portrait (tappable with
// a camera badge on the own profile), the identity lines, the
// posts/friends stats and the action row. The friends stat is
// pressable ONLY on the own profile, where it actually
// navigates — on other profiles it is a plain block, never a
// dead button. A profile the viewer has BLOCKED swaps the
// friend/message row for a single unblock button (the backend
// would 404 a friend request and 403 a message anyway), and a
// quiet block/report link row sits under the actions.
//
// Used by:
//   - ProfileScreen (below) — FlatList header
// -----------------------------------------------------------

function ProfileHeader({
  profile,
  isOwnProfile,
  canInteract,
  avatarUploading,
  actionLoading,
  hasPosts,
  onChangeAvatar,
  onFriendAction,
  onMessage,
  onOpenFriends,
  onBlockAction,
  onReport,
}: {
  profile: UserProfile;
  isOwnProfile: boolean;
  canInteract: boolean;
  avatarUploading: boolean;
  actionLoading: boolean;
  hasPosts: boolean;
  onChangeAvatar: () => void;
  onFriendAction: () => void;
  onMessage: () => void;
  onOpenFriends: () => void;
  onBlockAction: () => void;
  onReport: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const portrait = <Avatar uri={profile.avatarUrl} name={profile.displayName} size={88} />;


  return (
    <View className="items-center px-md pb-md pt-lg">

      {/* Portrait — tappable with a camera badge when own */}
      {isOwnProfile ? (
        <Pressable
          onPress={onChangeAvatar}
          disabled={avatarUploading}
          accessibilityRole="button"
          accessibilityLabel={t('id.changePhoto')}
          accessibilityState={{ busy: avatarUploading }}
        >
          {portrait}
          <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border border-line bg-surface">
            {avatarUploading ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Ionicons name="camera-outline" size={16} color={colors.brand} />
            )}
          </View>
        </Pressable>
      ) : (
        portrait
      )}

      {/* Identity lines */}
      <Text className="mt-sm text-center font-raleway-bold text-xl text-ink">
        {profile.displayName}
      </Text>
      <Text className="font-raleway-medium text-sm text-brand">
        {roleLabel(t, profile.role)}
      </Text>
      <Text className="mt-xs font-raleway text-xs text-ink-soft">@{profile.username}</Text>
      <Text className="mt-xs font-raleway text-xs text-ink-faint">
        {t('profile.memberSince', { date: formatDate(profile.createdAt) })}
      </Text>

      {/* Stats — the friends block navigates only when own */}
      <View className="mt-md flex-row items-center">
        <StatBlock value={profile.postCount} label={t('profile.posts')} />
        <View className="h-8 w-px bg-line" />
        {isOwnProfile ? (
          <Pressable
            onPress={onOpenFriends}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${profile.friendCount} ${t('profile.friends')}`}
          >
            <StatBlock value={profile.friendCount} label={t('profile.friends')} />
          </Pressable>
        ) : (
          <StatBlock value={profile.friendCount} label={t('profile.friends')} />
        )}
      </View>

      {/* Friend + message actions — other people's profiles,
          signed in only. A blocked profile gets the unblock
          button instead: every other action would only bounce
          off the backend's block gates */}
      {canInteract && profile.blockedByMe ? (
        <View className="mt-md w-full">
          <Button
            title={t('profile.unblock')}
            onPress={onBlockAction}
            variant="secondary"
            loading={actionLoading}
          />
        </View>
      ) : canInteract ? (
        <View className="mt-md w-full flex-row items-center gap-sm">
          <View className="flex-1">
            <FriendActionButton
              status={profile.friendshipStatus}
              loading={actionLoading}
              onPress={onFriendAction}
            />
          </View>
          <Pressable
            className="h-12 w-12 items-center justify-center rounded-md bg-surface-soft"
            onPress={onMessage}
            accessibilityRole="button"
            accessibilityLabel={t('messages.newMessage')}
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.ink} />
          </Pressable>
        </View>
      ) : null}

      {/* Quiet moderation links — block (when not already) and
          report, deliberately understated under the main row */}
      {canInteract && (
        <View className="mt-sm w-full flex-row items-center justify-center gap-xl">
          {!profile.blockedByMe && (
            <Pressable
              onPress={onBlockAction}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('profile.block')}
            >
              <Text className="font-raleway-medium text-xs text-ink-faint">
                {t('profile.block')}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onReport}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('profile.report')}
          >
            <Text className="font-raleway-medium text-xs text-ink-faint">
              {t('profile.report')}
            </Text>
          </Pressable>
        </View>
      )}

      {hasPosts && (
        <View className="mt-md w-full border-t border-line pt-sm">
          <Text className="font-raleway-bold text-sm text-ink-soft">
            {t('profile.recentPosts')}
          </Text>
        </View>
      )}

    </View>
  );
}







// -----------------------------------------------------------
// PostRow
// -----------------------------------------------------------
//
// One post preview card: title, a 3-line body, like/comment
// counts and a delete action on the own profile. Title and
// body arrive already entity-decoded — the api client decodes
// every response centrally. The Card is accessible={false} so
// screen readers reach the inner targets one by one: the text
// block is the dedicated open-post button and the trash keeps
// its own stop — grouped, the delete never surfaced at all.
// Deletion is optimistic (the row vanishes immediately), so no
// per-row spinner exists. Memoized so a list re-render touches
// only rows whose props actually moved.
//
// Used by:
//   - ProfileScreen (below) — FlatList rows
// -----------------------------------------------------------

const PostRow = memo(function PostRow({
  post,
  own,
  onOpen,
  onDelete,
}: {
  post: NewsPost;
  own: boolean;
  onOpen: (post: NewsPost) => void;
  onDelete: (post: NewsPost) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="mb-sm px-md">
      <Card onPress={() => onOpen(post)} accessible={false}>

        <View className="flex-row items-start gap-sm">
          {/* The open-post target for assistive tech; the stop
              keeps the tap from also firing the Card press
              (touches bubble on react-native-web) */}
          <Pressable
            className="flex-1"
            onPress={(event) => {
              event.stopPropagation();
              onOpen(post);
            }}
            accessibilityRole="button"
          >
            {post.title ? (
              <Text className="mb-xs font-raleway-bold text-base text-ink" numberOfLines={1}>
                {post.title}
              </Text>
            ) : null}
            <Text className="font-raleway text-sm text-ink-soft" numberOfLines={3}>
              {post.content || post.summary}
            </Text>
          </Pressable>

          {/* hitSlop 13 lifts the 18px glyph to a 44pt target */}
          {own && (
            <Pressable
              onPress={() => onDelete(post)}
              hitSlop={13}
              accessibilityRole="button"
              accessibilityLabel={t('profile.deletePost')}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          )}
        </View>

        <View className="mt-sm flex-row gap-md">
          <View className="flex-row items-center gap-xs">
            <Ionicons name="heart-outline" size={14} color={colors.inkSoft} />
            <Text className="font-raleway text-xs text-ink-soft">{post.likes}</Text>
          </View>
          <View className="flex-row items-center gap-xs">
            <Ionicons name="chatbubble-outline" size={14} color={colors.inkSoft} />
            <Text className="font-raleway text-xs text-ink-soft">{post.comments}</Text>
          </View>
        </View>

      </Card>
    </View>
  );
});







// -----------------------------------------------------------
// avatarErrorKey
// -----------------------------------------------------------
//
// Maps the backend's known upload rejections (file too large,
// type not allowed, content not a real image) plus the upload
// timeout to their own translated messages instead of echoing
// the English backend string; anything unrecognized — the
// profile PUT included — falls back to the generic avatar
// error.
//
// Used by:
//   - ProfileScreen (below) — avatar-change failure toast
// -----------------------------------------------------------

function avatarErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'timeout') return 'upload.timeout';
    if (err.status === 413 || err.serverCode === 'file_too_large') return 'upload.tooLarge';
    if (/type not allowed/i.test(err.message)) return 'upload.typeNotAllowed';
    if (/does not match/i.test(err.message)) return 'upload.invalidContent';
  }
  return 'profile.avatarError';
}







// -----------------------------------------------------------
// ProfileScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/profile
//   - pushed from friends/friend-requests rows (userId param)
//     and param-less for the signed-in user's own profile
// -----------------------------------------------------------

export default function ProfileScreen() {

  // useRouteParam owns the honest param shape — a repeated
  // ?userId= arrives as an array and a deep link can omit it
  const userId = useRouteParam('userId');
  const { user: me, isAuthenticated, setUser } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const returnTo = useReturnHref();
  const insets = useSafeAreaInsets();


  // No param means "my profile"; logged out that leaves no
  // target at all and the render shows a login prompt
  const targetId = userId || me?.id;
  const isOwnProfile = isAuthenticated && targetId === me?.id;


  // Profile state with a ref twin so async handlers (friend
  // actions, avatar upload) read the current value instead of
  // their render's snapshot
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const profileRef = useRef<UserProfile | null>(null);
  const profileSeqRef = useRef(0);

  const setProfile = useCallback((next: UserProfile | null) => {
    profileRef.current = next;
    setProfileState(next);
  }, []);


  // The paginated post list; deps restart it when the target
  // changes (e.g. me arrives after hydration on the own route)
  const posts = useFeed<NewsPost>(
    async (page) => {
      if (!targetId) return { items: [], hasMore: false };
      const response = await fetchUserPosts(targetId, page, POSTS_PER_PAGE);
      return { items: response.posts, hasMore: response.hasMore };
    },
    { deps: [targetId] },
  );


  // One code path for mount, retry, focus returns and
  // pull-to-refresh. Only the newest request may write (the
  // sequence guard), a 404 becomes the not-found body, other
  // failures raise error only when nothing is on screen — and
  // loading clears on every path. useCallback'd so the focus
  // effect can depend on it directly: the identity moves only
  // with the target
  const loadProfile = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (!targetId) return;
      const seq = ++profileSeqRef.current;

      // 'refresh' works silently behind the shown profile —
      // only the pull gesture drives a visible spinner
      if (mode === 'initial') {
        setLoading(true);
        setError(false);
        setProfile(null);
      }

      try {
        const data = await fetchUserProfile(targetId);
        if (seq !== profileSeqRef.current) return;
        setProfile(data);
        setError(false);
      } catch (err) {
        if (seq !== profileSeqRef.current) return;
        if (err instanceof ApiError && err.code === 'http' && err.status === 404) {
          // A real "no such user" — not-found body, not ErrorState
          setProfile(null);
          setError(false);
        } else {
          // Error only when the screen would otherwise show nothing
          setError(profileRef.current === null);
        }
      } finally {
        if (seq === profileSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [targetId, setProfile],
  );


  // First load with spinner; no target clears the flag so the
  // login prompt never hides behind an infinite spinner
  useEffect(() => {
    if (targetId) void loadProfile('initial');
    else setLoading(false);
  }, [targetId, loadProfile]);


  // Friendship status and counts go stale after actions on
  // other screens — resync the profile silently on every
  // return, leaving the paginated posts (and the reader's
  // scroll position) alone; the first focus rides the mount
  // load and is skipped
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void loadProfile('refresh');
    }, [loadProfile]),
  );


  // Pull-to-refresh owns this flag ALONE — focus refetches and
  // network-restore refetches run silently and must not spin
  // the pull control by themselves
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handleRefresh = async () => {
    setPullRefreshing(true);
    await Promise.all([loadProfile('refresh'), posts.refresh()]);
    setPullRefreshing(false);
  };


  // Back online: silent refetch behind a shown profile, full
  // spinner over nothing (posts refetch themselves in useFeed)
  useNetworkRestore(() => {
    void loadProfile(profileRef.current ? 'refresh' : 'initial');
  });


  // Pick → upload → persist the RELATIVE path → merge the
  // fresh User into AuthContext so the whole app sees the new
  // avatar (merge keeps `invited`, which the response omits)
  const handleChangeAvatar = async () => {
    if (avatarUploading) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      setAvatarUploading(true);
      const asset = result.assets[0];
      // fileSize rides along so a known-oversized pick is
      // refused before any bytes leave the device
      const upload = await uploadImageApi(
        asset.uri,
        asset.fileName ?? undefined,
        asset.mimeType ?? undefined,
        asset.fileSize ?? undefined,
      );
      const updated = await updateProfile({ avatar_url: upload.url });
      if (profileRef.current) setProfile({ ...profileRef.current, avatarUrl: upload.url });
      if (me) setUser({ ...me, ...updated });
      showToast('success', t('profile.avatarUpdated'));
    } catch (err) {
      showToast('error', t(avatarErrorKey(err)));
    } finally {
      setAvatarUploading(false);
    }
  };


  // All four friendship transitions. Unfriend confirms first;
  // accepting and cancelling resolve the request id on the fly
  // (the profile payload carries none) and resync when the
  // request is already gone
  const handleFriendAction = async () => {
    const current = profileRef.current;
    if (!current || actionLoading) return;

    if (current.friendshipStatus === 'friends') {
      const confirmed = await confirmAction({
        title: t('profile.unfriendTitle'),
        message: t('profile.unfriendConfirm', { name: current.displayName }),
        confirmLabel: t('profile.unfriend'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      setActionLoading(true);
      try {
        await unfriendUser(current.id);
        if (profileRef.current) {
          setProfile({
            ...profileRef.current,
            friendshipStatus: 'none',
            friendCount: Math.max(0, profileRef.current.friendCount - 1),
          });
        }
      } catch {
        showToast('error', t('profile.actionError'));
      } finally {
        setActionLoading(false);
      }
      return;
    }

    if (current.friendshipStatus === 'request_sent') {
      setActionLoading(true);
      try {
        // Resolve the pending request id among the sent rows
        const { requests } = await fetchFriendRequests('sent');
        const match = requests.find((request) => request.userId === current.id);
        if (!match) {
          // Accepted or expired in the meantime — resync the
          // status instead of leaving a stuck cancel button
          await loadProfile('refresh');
          return;
        }
        // The reject endpoint doubles as the sender's cancel
        await rejectFriendRequest(match.id);
        if (profileRef.current) {
          setProfile({ ...profileRef.current, friendshipStatus: 'none' });
        }
      } catch {
        showToast('error', t('profile.actionError'));
      } finally {
        setActionLoading(false);
      }
      return;
    }

    if (current.friendshipStatus === 'request_received') {
      setActionLoading(true);
      try {
        // The profile payload carries no request id — resolve it
        const { requests } = await fetchFriendRequests('received');
        const match = requests.find((request) => request.userId === current.id);
        if (!match) {
          // Withdrawn or handled in another session — resync the
          // status instead of leaving a dead accept button
          showToast('error', t('profile.actionError'));
          await loadProfile('refresh');
          return;
        }
        await acceptFriendRequest(match.id);
        if (profileRef.current) {
          setProfile({
            ...profileRef.current,
            friendshipStatus: 'friends',
            friendCount: profileRef.current.friendCount + 1,
          });
        }
      } catch {
        showToast('error', t('profile.actionError'));
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // 'none' — request the friendship. The backend auto-accepts
    // when the other side had already asked (status 'accepted',
    // no request row), so the response decides the next state
    setActionLoading(true);
    try {
      const result = await sendFriendRequest(current.id);
      if (profileRef.current) {
        if (result.status === 'accepted') {
          setProfile({
            ...profileRef.current,
            friendshipStatus: 'friends',
            friendCount: profileRef.current.friendCount + 1,
          });
        } else {
          setProfile({ ...profileRef.current, friendshipStatus: 'request_sent' });
        }
      }
    } catch (err) {
      // A 409 means a request (or the friendship) already
      // exists — name that, and resync so the button shows the
      // real state instead of 409ing forever
      const duplicate = err instanceof ApiError && err.code === 'http' && err.status === 409;
      showToast('error', t(duplicate ? 'profile.requestAlreadySent' : 'profile.actionError'));
      if (duplicate) await loadProfile('refresh');
    } finally {
      setActionLoading(false);
    }
  };


  // Optimistic own-post delete: remove, call, and on failure
  // revert SURGICALLY — re-insert only the removed post at its
  // recorded index and bump postCount back functionally. A
  // whole-list snapshot restore would clobber pages loaded or
  // rows changed while the request ran
  const handleDeletePost = useCallback(
    async (post: NewsPost) => {
      const confirmed = await confirmAction({
        title: t('profile.deletePost'),
        message: t('profile.deletePostConfirm'),
        confirmLabel: t('profile.deletePost'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      // Recorded inside the updater so it reflects the list
      // actually mutated, never a stale render snapshot
      let removedIndex = -1;
      posts.setItems((items) => {
        removedIndex = items.findIndex((item) => item.id === post.id);
        return items.filter((item) => item.id !== post.id);
      });
      if (profileRef.current) {
        setProfile({
          ...profileRef.current,
          postCount: Math.max(0, profileRef.current.postCount - 1),
        });
      }

      try {
        await deletePost(post.id);
        showToast('success', t('profile.postDeleted'));
      } catch {
        posts.setItems((items) => {
          if (items.some((item) => item.id === post.id)) return items;
          const next = [...items];
          const at = removedIndex < 0 ? next.length : Math.min(removedIndex, next.length);
          next.splice(at, 0, post);
          return next;
        });
        if (profileRef.current) {
          setProfile({ ...profileRef.current, postCount: profileRef.current.postCount + 1 });
        }
        showToast('error', t('profile.deleteError'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posts.setItems is a stable useFeed callback; the posts object itself is not
    [posts.setItems, setProfile, t],
  );


  // Stable row handlers — the memoized PostRow re-renders only
  // when its own post (or the own-profile flag) changes
  const handleDelete = useCallback(
    (post: NewsPost) => void handleDeletePost(post),
    [handleDeletePost],
  );

  const handleOpenPost = useCallback(
    (post: NewsPost) =>
      router.push({ pathname: '/(main)/news-post', params: { postId: post.id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: NewsPost }) => (
      <PostRow post={item} own={isOwnProfile} onOpen={handleOpenPost} onDelete={handleDelete} />
    ),
    [isOwnProfile, handleOpenPost, handleDelete],
  );


  const handleMessage = () => {
    const current = profileRef.current;
    if (!current) return;
    router.push({
      pathname: '/(main)/new-chat',
      params: { prefillUserId: current.id, prefillName: current.displayName },
    });
  };


  // Block / unblock. Blocking is confirmed (it severs the
  // friendship server-side, so the local state drops to 'none'
  // and the count follows); unblocking restores nothing and
  // needs no ceremony
  const handleBlockAction = async () => {
    const current = profileRef.current;
    if (!current || actionLoading) return;

    if (current.blockedByMe) {
      setActionLoading(true);
      try {
        await unblockUser(current.id);
        if (profileRef.current) {
          setProfile({ ...profileRef.current, blockedByMe: false });
        }
        showToast('success', t('profile.unblocked'));
      } catch {
        showToast('error', t('profile.actionError'));
      } finally {
        setActionLoading(false);
      }
      return;
    }

    const confirmed = await confirmAction({
      title: t('profile.blockTitle'),
      message: t('profile.blockConfirm', { name: current.displayName }),
      confirmLabel: t('profile.block'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      await blockUser(current.id);
      if (profileRef.current) {
        const wasFriends = profileRef.current.friendshipStatus === 'friends';
        setProfile({
          ...profileRef.current,
          blockedByMe: true,
          friendshipStatus: 'none',
          friendCount: wasFriends
            ? Math.max(0, profileRef.current.friendCount - 1)
            : profileRef.current.friendCount,
        });
      }
      showToast('success', t('profile.blocked'));
    } catch {
      showToast('error', t('profile.actionError'));
    } finally {
      setActionLoading(false);
    }
  };


  // Report: a confirm, then one row into the admin-reviewed
  // ledger — there is no free-text field on this screen, so
  // the reason is the fixed localized line
  const handleReport = async () => {
    const current = profileRef.current;
    if (!current) return;

    const confirmed = await confirmAction({
      title: t('profile.reportTitle'),
      message: t('profile.reportConfirm'),
      confirmLabel: t('profile.report'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await reportTarget('user', current.id, t('profile.reportReason'));
      showToast('success', t('profile.reported'));
    } catch {
      showToast('error', t('profile.actionError'));
    }
  };


  // Param-less and logged out: "my profile" has no target —
  // invite the visitor to sign in rather than spin forever
  if (!targetId) {
    return (
      <Screen>
        <EmptyState
          icon="person-circle-outline"
          title={t('profile.notFound')}
          action={{
            label: t('settings.login'),
            onPress: () => router.push({ pathname: '/login', params: { returnTo } }),
          }}
        />
      </Screen>
    );
  }


  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (error) {
    return (
      <Screen>
        <ErrorState
          message={t('profile.loadError')}
          offline={!isConnected}
          onRetry={() => {
            void loadProfile('initial');
            void posts.refresh();
          }}
        />
      </Screen>
    );
  }


  if (!profile) {
    return (
      <Screen>
        <EmptyState icon="person-circle-outline" title={t('profile.notFound')} />
      </Screen>
    );
  }


  return (
    <Screen>
      <FlatList
        data={posts.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          // flexGrow lets the empty/error states center instead
          // of collapsing; the inset clears the home indicator
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
        onEndReached={posts.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <ProfileHeader
            profile={profile}
            isOwnProfile={isOwnProfile}
            canInteract={isAuthenticated && !isOwnProfile}
            avatarUploading={avatarUploading}
            actionLoading={actionLoading}
            hasPosts={posts.items.length > 0}
            onChangeAvatar={() => void handleChangeAvatar()}
            onFriendAction={() => void handleFriendAction()}
            onMessage={handleMessage}
            onOpenFriends={() => router.push('/(main)/friends')}
            onBlockAction={() => void handleBlockAction()}
            onReport={() => void handleReport()}
          />
        }
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListEmptyComponent={
          posts.error ? (
            <ErrorState onRetry={() => void posts.refresh()} />
          ) : posts.loading ? (
            <LoadingSpinner size="small" />
          ) : (
            <EmptyState icon="document-text-outline" title={t('profile.noPosts')} />
          )
        }
        ListFooterComponent={posts.loadingMore ? <LoadingSpinner size="small" /> : null}
      />
    </Screen>
  );
}
