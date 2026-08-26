// -----------------------------------------------------------
//  [*] Main — pushed-screen stack
//
//  The navigation shell of the signed-in area: the tab group
//  mounts headerless as the first screen, and every screen a
//  tab can push — chat rooms, news posts, comments, profile,
//  friends, admin, faculty info — registers here with a
//  translated title on the burgundy header.
//
//  Header colors come from useTheme() rather than className
//  tokens because navigation options are plain JS props; the
//  brandHeader token keeps the bar burgundy in light mode and
//  dims it in dark mode, matching the tab screens' own Header
//  component. Titles and the iOS back label re-render on
//  language change because t() is read inside the component.
//
//  The old (main)/settings stack route is gone — settings is
//  reachable only as a tab now, so it is not registered here.
// -----------------------------------------------------------

// Navigation shell
import { Stack } from 'expo-router';

// Translated titles on a themed header
import { useTranslation } from 'react-i18next';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';







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
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandHeader },
        headerTintColor: colors.onBrand,
        headerTitleStyle: { fontFamily: fonts.semiBold },
        headerBackTitle: t('common.back'),
        headerShadowVisible: false,
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
  );
}
