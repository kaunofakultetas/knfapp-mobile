import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  margin?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  margin = 'none',
  children,
  className,
  ...props
}) => {
  // Base classes
  const baseClasses = 'rounded-lg bg-background-card';
  
  // Variant classes
  const variantClasses = {
    default: 'bg-background-card',
    elevated: 'bg-background-card shadow-md',
    outlined: 'bg-background-card border border-border-light',
  };
  
  // Padding classes
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-sm',
    md: 'p-md',
    lg: 'p-lg',
  };
  
  // Margin classes
  const marginClasses = {
    none: 'm-0',
    sm: 'm-sm',
    md: 'm-md',
    lg: 'm-lg',
  };
  
  // Combine classes
  const cardClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${paddingClasses[padding]}
    ${marginClasses[margin]}
    ${className || ''}
  `.trim();

  return (
    <View className={cardClasses} {...props}>
      {children}
    </View>
  );
};

// No more StyleSheet needed! All styles are now in TailwindCSS classes