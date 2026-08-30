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
//  Swipe-to-close: reader screens — the article, its comment
//  thread, profile, friends, friend requests, faculty info —
//  dismiss with a swipe ANYWHERE on the screen on iOS
//  (fullScreenGestureEnabled), not just the left edge. Four
//  screens deliberately keep the edge-only default:
//
//    chat-room    — a rightward drag on an incoming bubble IS
//                   swipe-to-reply (chatuikit/MessageBubble); a
//                   full-screen back pan would eat it
//    create-post  — a long draft; an accidental pan must not
//                   discard it
//    new-chat     — search + group-name form, same draft risk
//    admin,
//    admin-users  — invitation/role forms and the QR flow
//
//  Android needs nothing here: the system back gesture (or
//  button) already closes any pushed screen, and native-stack
//  has no in-app full-screen pan on Android. Web keeps the
//  browser's own back; none of this renders there.
//
//  The old (main)/settings stack route is gone — settings is
//  reachable only as a tab now, so it is not registered here.
//
//  Split into (root component last):
//
//    renderHeader — the Stack `header` option
//    MainStack    — the stack in its accessibility shield
//    MainLayout   — provider, stack, drawer (default export)
// -----------------------------------------------------------

// Navigation shell
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';

// The drawer and the shared header
import ChatEngineHost from '@/components/chat/ChatEngineHost';
import ChatUiKitHost from '@/components/chat/ChatUiKitHost';
import Sidebar from '@/components/Sidebar';
import StackHeader, { type StackHeaderProps } from '@/components/navigation/StackHeader';
import DrawerProvider, { useDrawer } from '@/context/DrawerContext';

// Translated titles, themed content color
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';


// Module-level so the Stack sees one stable header identity
const renderHeader = (props: StackHeaderProps) => <StackHeader {...props} />;







// -----------------------------------------------------------
// MainStack
// -----------------------------------------------------------
//
// The pushed-screen stack inside an accessibility shield:
// while the drawer is open, everything beneath it is hidden
// from TalkBack/VoiceOver/web readers so assistive focus
// cannot wander behind the scrim.
//
// Used by:
//   - MainLayout (below)
// -----------------------------------------------------------

function MainStack() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isOpen } = useDrawer();


  return (
    <View
      className="flex-1"
      importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}
      aria-hidden={isOpen}
    >
      {/* The standalone chatuikit's theme/labels/env — above every
          screen that renders kit components */}
      <ChatEngineHost>
      <ChatUiKitHost>
      <Stack
        screenOptions={{
          header: renderHeader,
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          contentStyle: { backgroundColor: colors.canvas },
          // Reader screens close with a swipe anywhere (iOS);
          // the exceptions below opt back down to edge-only —
          // see the banner for the reasoning per screen
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="tabs" options={{ headerShown: false }} />
        <Stack.Screen
          name="new-chat/index"
          options={{ title: t('newChat.title'), fullScreenGestureEnabled: false }}
        />
        <Stack.Screen name="news-comments/index" options={{ title: t('news.comments') }} />
        <Stack.Screen name="news-post/index" options={{ title: t('news.title') }} />
        <Stack.Screen
          name="chat-room/index"
          options={{ title: t('chat.title'), fullScreenGestureEnabled: false }}
        />
        <Stack.Screen name="profile/index" options={{ title: t('profile.title') }} />
        <Stack.Screen
          name="create-post/index"
          options={{ title: t('profile.newPost'), fullScreenGestureEnabled: false }}
        />
        <Stack.Screen name="friends/index" options={{ title: t('friends.title') }} />
        <Stack.Screen name="friend-requests/index" options={{ title: t('friendRequests.title') }} />
        <Stack.Screen name="delete-account/index" options={{ title: t('deleteAccount.title') }} />
        <Stack.Screen
          name="admin/index"
          options={{ title: t('admin.title'), fullScreenGestureEnabled: false }}
        />
        <Stack.Screen
          name="admin-users/index"
          options={{ title: t('admin.userList'), fullScreenGestureEnabled: false }}
        />
        <Stack.Screen name="info/index" options={{ title: t('info.title') }} />
      </Stack>
      </ChatUiKitHost>
      </ChatEngineHost>
    </View>
  );
}







// -----------------------------------------------------------
// MainLayout (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — layout of the (main) route group
// -----------------------------------------------------------

export default function MainLayout() {

  return (
    <DrawerProvider>
      <View className="flex-1">

        <MainStack />

        {/* The drawer layer — above the stack and the tab bar */}
        <Sidebar />

      </View>
    </DrawerProvider>
  );
}
