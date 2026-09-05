import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/use-auth";
import { humanizeApiError } from "@/lib/api-error";
import { spacing } from "@/theme/tokens";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = fullName.trim().length > 1 && phone.trim().length > 5 && password.length >= 8;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await register({ fullName: fullName.trim(), phone: phone.trim(), password });
      router.replace("/link-garage");
    } catch (err) {
      setError(humanizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="title">Create your account</Text>
        <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
          Use the same phone number your garage has on file — we&apos;ll find your car automatically.
        </Text>
      </View>

      <View style={styles.form}>
        <Input label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" placeholder="Your name" />
        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="+251 9xx xxx xxx"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        {error && (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        )}
        <Button onPress={handleSubmit} loading={loading} disabled={!canSubmit}>
          Create account
        </Button>
      </View>

      <View style={styles.footer}>
        <Text variant="caption" tone="graphite">
          Already have an account?
        </Text>
        <Link href="/(auth)/login" replace>
          <Text variant="caption" tone="signal">
            {" "}
            Sign in
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center" },
  header: { marginBottom: spacing.xxl },
  form: { gap: spacing.md },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
});
