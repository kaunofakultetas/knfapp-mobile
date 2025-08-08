import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  containerClassName?: string;
  inputClassName?: string;
  variant?: 'default' | 'filled' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  rightIcon,
  onRightIconPress,
  containerClassName,
  inputClassName,
  variant = 'outline',
  size = 'md',
  secureTextEntry,
  ...props
}) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleTogglePassword = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  // Container classes
  const containerClasses = `mb-md ${containerClassName || ''}`;

  // Input container variant classes
  const variantClasses = {
    default: 'border-b border-border-light',
    filled: 'bg-background-secondary px-md',
    outline: 'border border-border-light px-md',
  };

  // Size classes
  const sizeClasses = {
    sm: 'h-10',
    md: 'h-12',
    lg: 'h-14',
  };

  // Input container classes
  const inputContainerClasses = `
    flex-row items-center rounded-md
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${isFocused ? 'border-2 border-primary' : ''}
    ${error ? 'border-danger' : ''}
  `.trim();

  // Text input classes
  const textInputClasses = `
    flex-1 font-raleway text-base text-text-primary py-0
    ${inputClassName || ''}
  `.trim();

  const showPasswordToggle = secureTextEntry && !rightIcon;
  const actualSecureTextEntry = secureTextEntry && !isPasswordVisible;

  return (
    <View className={containerClasses}>
      {label && (
        <Text className="text-sm font-raleway-medium text-text-primary mb-xs">
          {label}
        </Text>
      )}
      
      <View className={inputContainerClasses}>
        {icon && (
          <View className="p-xs">
            {icon}
          </View>
        )}
        
        <TextInput
          className={textInputClasses}
          secureTextEntry={actualSecureTextEntry}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor="#757575"
          clearButtonMode="while-editing"
          returnKeyType={secureTextEntry ? 'done' : 'next'}
          blurOnSubmit={false}
          {...props}
        />
        
        {showPasswordToggle && (
          <TouchableOpacity 
            className="p-xs"
            onPress={handleTogglePassword}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#757575"
            />
          </TouchableOpacity>
        )}
        
        {rightIcon && (
          <TouchableOpacity 
            className="p-xs"
            onPress={onRightIconPress}
          >
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>
      
      {error && (
        <Text className="text-xs text-danger mt-xs font-raleway">
          {error}
        </Text>
      )}
      {helperText && !error && (
        <Text className="text-xs text-text-secondary mt-xs font-raleway">
          {helperText}
        </Text>
      )}
    </View>
  );
};

// No more StyleSheet needed! All styles are now in TailwindCSS classes
// The component is now much cleaner and more maintainable