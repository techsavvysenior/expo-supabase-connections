import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorNotice, colors } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { toAppError, type AppError } from '@/lib/errors';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const creating = mode === 'sign-up';

  function validate(): string | null {
    if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (creating && displayName.trim().length === 0) return 'Enter your name.';
    return null;
  }

  async function submit() {
    const invalid = validate();
    setProblem(invalid);
    setError(null);
    if (invalid) return;

    setSubmitting(true);
    try {
      if (creating) {
        await signUp(email.trim(), password, displayName.trim());
      } else {
        await signIn(email.trim(), password);
      }
      // No navigation here. The root layout swaps screens when the session changes.
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>
            {creating ? 'Create your account' : 'Welcome back'}
          </Text>

          {error ? <ErrorNotice error={error} onRetry={submit} /> : null}

          {creating ? (
            <TextInput
              accessibilityLabel="Name"
              autoComplete="name"
              editable={!submitting}
              onChangeText={setDisplayName}
              placeholder="Name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="name"
              value={displayName}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!submitting}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="email"
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            editable={!submitting}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            testID="password"
            value={password}
          />

          {problem ? (
            <Text accessibilityLiveRegion="polite" style={styles.problem}>
              {problem}
            </Text>
          ) : null}

          <Button
            label={creating ? 'Create account' : 'Sign in'}
            loading={submitting}
            onPress={submit}
            testID="submit"
          />

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            hitSlop={8}
            onPress={() => {
              setMode(creating ? 'sign-in' : 'sign-up');
              setProblem(null);
              setError(null);
            }}>
            <Text style={styles.switch}>
              {creating ? 'I already have an account' : 'Create an account'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: 14, justifyContent: 'center', padding: 24 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  problem: { color: colors.danger, fontSize: 14 },
  switch: { color: colors.primary, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
