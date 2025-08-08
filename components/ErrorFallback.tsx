import { Button } from '@/components/ui';
import { Theme } from '@/constants/Theme';
import * as Linking from 'expo-linking';
import React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export const ErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('error.title')}</Text>
      <Text style={styles.message}>
        {error?.message || t('error.unexpected')}
      </Text>
      <Button
        title={t('common.tryAgain')}
        onPress={resetErrorBoundary}
        style={styles.button}
      />
      <Button
        title={t('common.reportIssue')}
        onPress={() => Linking.openURL('mailto:support@vu.lt?subject=KNF%20App%20Error')}
        style={styles.button}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
    backgroundColor: Theme.colors.background.primary,
  },
  title: {
    fontSize: Theme.typography.fontSize['2xl'],
    fontFamily: Theme.typography.fontFamily.bold,
    color: Theme.colors.text.primary,
    marginBottom: Theme.spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: Theme.typography.fontSize.base,
    fontFamily: Theme.typography.fontFamily.regular,
    color: Theme.colors.text.secondary,
    marginBottom: Theme.spacing.xl,
    textAlign: 'center',
    lineHeight: Theme.typography.lineHeight.base,
  },
  button: {
    marginTop: Theme.spacing.lg,
  },
});