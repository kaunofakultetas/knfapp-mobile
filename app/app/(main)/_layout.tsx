// -----------------------------------------------------------
//  [*] Main — pushed-screen stack + the app drawer
//
//  The navigation shell of the signed-in area: the tab group
//  mounts headerless as the first screen, and every screen a
//  tab can push — chat rooms, news posts, comments, profile,
//  friends, admin, faculty info — registers here with a
//  translated title.
//
//  Two things make this shell feel like one app rather than a
//  stack of defaults: every pushed screen renders the shared
//  StackHeader (the same 56pt burgundy bar as the tab
//  screens' own Header, back chevron, right-action slot), and
//  the navigation drawer lives HERE — mounted once as a layer
//  over the stack and switched through DrawerContext — so any
//  header's hamburger opens the same drawer and the tab bar
//  sits beneath it.
//
//  Transitions: the platform push on iOS (edge-swipe back
//  included), slide-from-right on Android; the screen content
//  color is the canvas token so no white flashes between
//  screens in dark mode.
//
//  The old (main)/settings stack route is gone — settings is
//  reachable only as a tab now, so it is not registered here.
//
//  Split into (root component last):
//
//    renderHeader — the Stack `header` option
//    MainLayout   — provider, stack, drawer (default export)
// -----------------------------------------------------------

// Navigation shell
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';

// The drawer and the shared header
import Sidebar from '@/components/Sidebar';
import StackHeader, { type StackHeaderProps } from '@/components/navigation/StackHeader';
import DrawerProvider from '@/context/DrawerContext';

// Translated titles, themed content color
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';


// Module-level so the Stack sees one stable header identity
const renderHeader = (props: StackHeaderProps) => <StackHeader {...props} />;







// -----------------------------------------------------------
// MainLayout (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — layout of the (main) route group
// -----------------------------------------------------------

export default function MainLayout() {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <DrawerProvider>
      <View className="flex-1">

        <Stack
          screenOptions={{
            header: renderHeader,
            animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="tabs" options={{ headerShown: false }} />
          <Stack.Screen name="new-chat/index" options={{ title: t('newChat.title') }} />
          <Stack.Screen name="news-comments/index" options={{ title: t('news.comments') }} />
          <Stack.Screen name="news-post/index" options={{ title: t('news.title') }} />
          <Stack.Screen name="chat-room/index" options={{ title: t('chat.title') }} />
          <Stack.Screen name="profile/index" options={{ title: t('profile.title') }} />
          <Stack.Screen name="create-post/index" options={{ title: t('profile.newPost') }} />
          <Stack.Screen name="friends/index" options={{ title: t('friends.title') }} />
          <Stack.Screen name="friend-requests/index" options={{ title: t('friendRequests.title') }} />
          <Stack.Screen name="admin/index" options={{ title: t('admin.title') }} />
          <Stack.Screen name="admin-users/index" options={{ title: t('admin.userList') }} />
          <Stack.Screen name="info/index" options={{ title: t('info.title') }} />
        </Stack>

        {/* The drawer layer — above the stack and the tab bar */}
        <Sidebar />

      </View>
    </DrawerProvider>
  );
}
