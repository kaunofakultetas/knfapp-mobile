// -----------------------------------------------------------
//  [*] UI kit — Button
//
//  The app's one press target: five variants on a single
//  shape. Pressable (not TouchableOpacity) so the pressed
//  state is a real color change — primary darkens to
//  brand-strong, soft and transparent variants tint with
//  surface-soft, danger dims (the palette carries no
//  danger-strong token).
//
//  While `loading` the spinner replaces the whole content and
//  presses are ignored; the fixed heights keep the swap from
//  shifting layout. Disabled opacity is applied ONCE, on the
//  container — the old kit stacked it on the label too and
//  faded the text to ~36%.
//
//  Full width is the default: forms and overlays want
//  edge-to-edge actions; row placements pass
//  fullWidth={false} and the button shrinks to its content.
// -----------------------------------------------------------

// Icon glyphs for the optional left icon
import { Ionicons } from '@expo/vector-icons';

// Press handling, spinner and label primitives
import { ActivityIndicator, Pressable, Text, type ViewStyle } from 'react-native';

// Spinner, icon and pressed colors for the active scheme
import { useTheme } from '@/hooks/useTheme';


type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
}

// Container fill per variant; outline keeps a constant-width
// brand border so toggling variants never shifts layout
const CONTAINER_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand',
  secondary: 'bg-surface-soft',
  outline: 'border border-brand bg-transparent',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

// Fixed heights keep the loading-spinner swap jump-free
const CONTAINER_SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 px-md',
  md: 'h-12 px-lg',
  lg: 'h-14 px-xl',
};

// Label color mirrors the container fill
const TEXT_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'text-on-brand',
  secondary: 'text-ink',
  outline: 'text-brand',
  ghost: 'text-brand',
  danger: 'text-on-brand',
};

const TEXT_SIZES: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

// Left icon tracks the label size
const ICON_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };







// -----------------------------------------------------------
// Button (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/login.tsx, app/register.tsx — form submits
//   - app/(main)/tabs/settings.tsx — account actions
//   - components/ui/EmptyState.tsx — the optional action
//   - components/ui/ErrorState.tsx — the retry action
//   - components/LoginRequiredOverlay.tsx — the login prompt
//   - components/ErrorFallback.tsx — report / try again
// -----------------------------------------------------------

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  leftIcon,
}: ButtonProps) {

  const { colors } = useTheme();
  const isDisabled = disabled || loading;


  // Spinner and icon share the variant's label color
  const contentColor =
    variant === 'primary' || variant === 'danger'
      ? colors.onBrand
      : variant === 'secondary'
        ? colors.ink
        : colors.brand;


  // Pressed feedback via dedicated tokens where the palette
  // has them; danger dims instead (no danger-strong exists).
  // Inline style wins over the className fill only while held.
  const pressedStyles: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.brandStrong },
    secondary: { backgroundColor: colors.line },
    outline: { backgroundColor: colors.surfaceSoft },
    ghost: { backgroundColor: colors.surfaceSoft },
    danger: { opacity: 0.8 },
  };


  // The sm height is 40px — hitSlop restores the 44pt target
  const hitSlop = size === 'sm' ? 4 : undefined;


  const containerClasses = [
    'flex-row items-center justify-center gap-sm rounded-md',
    CONTAINER_VARIANTS[variant],
    CONTAINER_SIZES[size],
    fullWidth ? 'w-full' : 'self-start',
    isDisabled ? 'opacity-50' : '',
  ].join(' ');


  return (
    <Pressable
      className={containerClasses}
      style={({ pressed }) => (pressed && !isDisabled ? pressedStyles[variant] : undefined)}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {leftIcon && <Ionicons name={leftIcon} size={ICON_SIZES[size]} color={contentColor} />}
          <Text className={`font-raleway-medium ${TEXT_VARIANTS[variant]} ${TEXT_SIZES[size]}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// Named alongside the default so the ui barrel can `export *`
export { Button };
