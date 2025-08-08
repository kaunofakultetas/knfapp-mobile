import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Theme } from '@/constants/Theme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'large',
  color = Theme.colors.primary,
  text,
  overlay = false,
}) => {
  const containerStyle = [
    styles.container,
    overlay && styles.overlay,
  ];

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={styles.text}>{text}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 1000,
  },
  text: {
    marginTop: Theme.spacing.md,
    fontSize: Theme.typography.fontSize.base,
    color: Theme.colors.text.secondary,
    fontFamily: Theme.typography.fontFamily.regular,
  },
});