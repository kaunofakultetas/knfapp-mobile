// -----------------------------------------------------------
//  [*] Navigation — StackHeader
//
//  The header of every pushed screen, replacing the native
//  stack's default so pushed screens and tab screens share one
//  bar: the same burgundy band, the same 56pt row, the same
//  Raleway title. Left: a 44pt back chevron (falls back to the
//  news tab when the screen was deep-linked with no history).
//  Right: whatever the screen sets as headerRight, rendered
//  with the on-brand tint (chat-room's search toggle).
//
//  The props shape is the subset of react-navigation's
//  NativeStackHeaderProps this bar reads, declared locally so
//  the component does not depend on native-stack's types.
//
//  Split into (root component last):
//
//    BackButton  — the chevron with haptic + fallback route
//    StackHeader — the bar (default export)
// -----------------------------------------------------------

// JS-side colors
import { useTheme } from '@/hooks/useTheme';

// Bar chrome
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


// The slice of NativeStackHeaderProps this bar reads
export interface StackHeaderProps {
  navigation: { goBack: () => void; canGoBack: () => boolean };
  route: { name: string };
  options: {
    title?: string;
    headerTitle?: string | ((props: { children: string; tintColor?: string }) => ReactNode);
    headerRight?: (props: { tintColor?: string; canGoBack: boolean }) => ReactNode;
    headerShown?: boolean;
  };
  back?: { title?: string };
}







// -----------------------------------------------------------
// BackButton
// -----------------------------------------------------------
//
// Pops the stack when there is history; a deep-linked screen
// with none goes home to the news tab instead of dead-ending.
//
// Used by:
//   - StackHeader (below)
// -----------------------------------------------------------

function BackButton({ navigation }: { navigation: StackHeaderProps['navigation'] }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();


  const goBack = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.navigate('/(main)/tabs/news');
    }
  };


  return (
    <Pressable
      onPress={goBack}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('header.back')}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: -8,
          marginRight: 8,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="chevron-back" size={26} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// StackHeader (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — the Stack's `header` option
// -----------------------------------------------------------

export default function StackHeader({ navigation, route, options }: StackHeaderProps) {

  const { colors } = useTheme();


  if (options.headerShown === false) return null;


  // headerTitle wins over title, then the route name — the same
  // precedence react-navigation's getHeaderTitle applies
  const titleText =
    typeof options.headerTitle === 'string'
      ? options.headerTitle
      : options.title ?? route.name;
  const canGoBack = navigation.canGoBack();


  return (
    <SafeAreaView edges={['top']} className="bg-brand-header">
      <View className="flex-row items-center px-lg" style={{ height: 56 }}>
        <BackButton navigation={navigation} />
        {typeof options.headerTitle === 'function' ? (
          options.headerTitle({ children: titleText, tintColor: colors.onBrand })
        ) : (
          <Text className="flex-1 font-raleway-bold text-xl text-on-brand" numberOfLines={1}>
            {titleText}
          </Text>
        )}
        {options.headerRight ? (
          <View className="ml-sm flex-row items-center">
            {options.headerRight({ tintColor: colors.onBrand, canGoBack })}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
