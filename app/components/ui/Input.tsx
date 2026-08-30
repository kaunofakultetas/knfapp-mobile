// -----------------------------------------------------------
//  [*] UI kit — Input
//
//  Labeled text field on surface-soft with a CONSTANT border
//  width — focus and error change the border COLOR only
//  (line-strong → brand → danger), so the field contents
//  never shift by a pixel; the old kit swapped 1px→2px on
//  every focus.
//
//  Internal focus handlers COMPOSE with consumer onFocus /
//  onBlur instead of being replaced by the props spread —
//  the old kit silently lost its focus styling when a caller
//  passed either. secureTextEntry adds an eye toggle with a
//  translated a11y label; submitBehavior replaces the
//  deprecated blurOnSubmit, keeping focus on submit so forms
//  can chain fields through the forwarded TextInput ref.
// -----------------------------------------------------------

// Eye-toggle and left-icon glyphs
import { Ionicons } from '@expo/vector-icons';

// Field primitives and the forwarded-ref plumbing
import { forwardRef, useState } from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type AccessibilityState,
  type TextInputProps,
} from 'react-native';

// Translated a11y labels for the password toggle
import { useTranslation } from 'react-i18next';

// Placeholder and icon colors for the active scheme
import { useTheme } from '@/hooks/useTheme';


interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  containerClassName?: string;
}







// -----------------------------------------------------------
// Input (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/login.tsx, app/register.tsx — the auth forms
//   - app/(main)/tabs/id.tsx — student-card edit fields
//   - app/(main)/new-chat/ — user search + group name
//   - app/(main)/create-post/ — title, content and poll rows
// -----------------------------------------------------------

const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    leftIcon,
    containerClassName,
    secureTextEntry,
    multiline,
    style,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);


  // Compose with the consumer's handler — never replace it
  const handleFocus: TextInputProps['onFocus'] = (event) => {
    setFocused(true);
    onFocus?.(event);
  };


  const handleBlur: TextInputProps['onBlur'] = (event) => {
    setFocused(false);
    onBlur?.(event);
  };


  // Error outranks focus so a failed field stays red while
  // the user is typing the correction
  const borderClass = error ? 'border-danger' : focused ? 'border-brand' : 'border-line-strong';


  // min-h, not h: at large accessibility text sizes the field
  // grows with the scaled text instead of clipping it
  const fieldClasses = [
    'flex-row gap-sm rounded-md border bg-surface-soft px-md',
    multiline ? 'items-start py-sm' : 'min-h-12 items-center py-xs',
    borderClass,
  ].join(' ');


  return (
    <View className={`mb-md ${containerClassName ?? ''}`}>

      {label && <Text className="mb-xs font-raleway-medium text-sm text-ink">{label}</Text>}

      <View className={fieldClasses}>

        {leftIcon && (
          <Ionicons name={leftIcon} size={20} color={focused ? colors.brand : colors.inkFaint} />
        )}

        {/* Defaults sit before the spread so callers can
            override them; the composed handlers, the toggled
            secure flag and the a11y error plumbing sit after
            so they cannot */}
        <TextInput
          ref={ref}
          className="flex-1 py-0 font-raleway text-base text-ink"
          placeholderTextColor={colors.inkFaint}
          clearButtonMode="while-editing"
          returnKeyType={multiline ? undefined : secureTextEntry ? 'done' : 'next'}
          submitBehavior={multiline ? 'newline' : 'submit'}
          accessibilityLabel={label}
          {...rest}
          style={[multiline ? { textAlignVertical: 'top' as const } : null, style]}
          multiline={multiline}
          secureTextEntry={secureTextEntry && !passwordVisible}
          // A revealed password must never leak into the
          // autocorrect/spellcheck dictionaries; Android's
          // visible-password keyboard also drops suggestions
          autoCorrect={secureTextEntry ? false : rest.autoCorrect}
          spellCheck={secureTextEntry ? false : rest.spellCheck}
          keyboardType={
            secureTextEntry && passwordVisible && Platform.OS === 'android'
              ? 'visible-password'
              : rest.keyboardType
          }
          // `invalid` is not in RN's AccessibilityState typing
          // (web maps it to aria-invalid; native ignores it),
          // hence the assertion; the hint reads the error out
          accessibilityHint={error ?? rest.accessibilityHint}
          accessibilityState={
            { ...rest.accessibilityState, invalid: !!error } as AccessibilityState
          }
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        {secureTextEntry && (
          <Pressable
            onPress={() => setPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={t(passwordVisible ? 'common.hidePassword' : 'common.showPassword')}
            // A full 44pt target; the negative margin keeps the
            // glyph on the field's original inset
            style={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: -12,
            }}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.inkFaint}
            />
          </Pressable>
        )}
      </View>

      {/* Error replaces the helper — one line below the field;
          the live region reads it out the moment it appears */}
      {error ? (
        <Text accessibilityLiveRegion="assertive" className="mt-xs font-raleway text-xs text-danger">
          {error}
        </Text>
      ) : helperText ? (
        <Text className="mt-xs font-raleway text-xs text-ink-soft">{helperText}</Text>
      ) : null}
    </View>
  );
});

export default Input;
