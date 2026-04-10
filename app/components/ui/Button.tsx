import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  ActivityIndicator,
  TouchableOpacityProps
} from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  textClassName?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  className,
  textClassName,
  onPress,
  ...props
}) => {
  // Base classes for the button
  const baseClasses = 'flex-row items-center justify-center rounded-md font-raleway-medium';
  
  // Variant classes
  const variantClasses = {
    primary: 'bg-primary',
    secondary: 'bg-gray-200',
    outline: 'bg-transparent border border-primary',
    ghost: 'bg-transparent',
  };
  
  // Size classes
  const sizeClasses = {
    sm: 'h-10 px-md',
    md: 'h-12 px-lg',
    lg: 'h-14 px-xl',
  };
  
  // Text variant classes
  const textVariantClasses = {
    primary: 'text-white',
    secondary: 'text-text-primary',
    outline: 'text-primary',
    ghost: 'text-primary',
  };
  
  // Text size classes
  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };
  
  // Combine classes
  const buttonClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${fullWidth ? 'w-full' : ''}
    ${disabled ? 'opacity-60' : ''}
    ${className || ''}
  `.trim();
  
  const textClasses = `
    ${textVariantClasses[variant]}
    ${textSizeClasses[size]}
    font-raleway-medium
    ${disabled ? 'opacity-60' : ''}
    ${textClassName || ''}
  `.trim();

  const loadingColor = variant === 'primary' ? '#FFFFFF' : '#7B003F';

  return (
    <TouchableOpacity
      className={buttonClasses}
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={loadingColor} />
      ) : (
        <>
          {icon}
          <Text className={textClasses}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

// No more StyleSheet needed! All styles are now in TailwindCSS classes
// This makes the component much cleaner and easier to maintain