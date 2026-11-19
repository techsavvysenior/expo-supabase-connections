import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { describeError, isRetryable, type AppError } from '@/lib/errors';

export const colors = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#E3E6EB',
  text: '#14171F',
  muted: '#5B6472',
  primary: '#2456E6',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerSurface: '#FCEEEE',
  success: '#17713F',
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (inactive || pressed) && styles.dimmed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.buttonLabel, !primary && styles.buttonLabelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ErrorNotice({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.notice}>
      <Text style={styles.noticeText}>{describeError(error)}</Text>
      {onRetry && isRetryable(error) ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
          <Text style={styles.noticeAction}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Loading() {
  return (
    <Centered>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.primary} size="large" />
    </Centered>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Centered>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Centered>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  buttonLabel: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  buttonLabelSecondary: { color: colors.primary },
  dimmed: { opacity: 0.6 },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.dangerSurface,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  noticeText: { color: colors.danger, flex: 1, fontSize: 15 },
  noticeAction: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  centered: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
