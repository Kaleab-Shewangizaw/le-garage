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

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(humanizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="title">Le Garage</Text>
        <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
          Whenever something happens with your car, open Le Garage.
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          label="Phone or email"
          value={identifier}
          onChangeText={setIdentifier}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          placeholder="+251 9xx xxx xxx"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        {error && (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        )}
        <Button onPress={handleSubmit} loading={loading} disabled={!identifier.trim() || !password}>
          Sign in
        </Button>
      </View>

      <View style={styles.footer}>
        <Text variant="caption" tone="graphite">
          New here?
        </Text>
        <Link href="/(auth)/register" replace>
          <Text variant="caption" tone="signal">
            {" "}
            Create an account
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
