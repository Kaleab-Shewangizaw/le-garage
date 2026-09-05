import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { InitialsCircle } from "@/components/InitialsCircle";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/use-auth";
import { useCustomerLinks } from "@/hooks/use-customer-links";
import { spacing, colors } from "@/theme/tokens";

export default function ProfileScreen() {
  const { me, logout } = useAuth();
  const links = useCustomerLinks();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/(auth)/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <InitialsCircle name={me?.fullName ?? "?"} size={64} />
        <Text variant="heading" style={{ marginTop: spacing.md }}>
          {me?.fullName}
        </Text>
        {me?.phone && (
          <Text variant="caption" tone="graphite">
            {me.phone}
          </Text>
        )}
      </View>

      <Text variant="eyebrow" tone="muted" style={styles.sectionLabel}>
        Linked garages
      </Text>
      <Card>
        {links.data?.length ? (
          links.data.map((l, i) => (
            <View key={l.customerId} style={[styles.linkRow, i > 0 && styles.linkRowBorder]}>
              <Text variant="bodyMedium">{l.garageName}</Text>
              <Text variant="caption" tone="graphite">
                as {l.customerFullName}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="caption" tone="graphite">
            No garage records linked yet.
          </Text>
        )}
        <View style={{ marginTop: spacing.md }}>
          <Button variant="secondary" size="md" onPress={() => router.push("/(app)/link-garage")}>
            Find more garage records
          </Button>
        </View>
      </Card>

      <Text variant="eyebrow" tone="muted" style={styles.sectionLabel}>
        Emergency
      </Text>
      <Card style={{ opacity: 0.6 }}>
        <Text variant="bodyMedium">My car won&apos;t move</Text>
        <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
          Coming soon — roadside help, right from the app.
        </Text>
      </Card>

      <View style={{ marginTop: spacing.xxl }}>
        <Button variant="secondary" onPress={handleLogout} loading={loggingOut}>
          Sign out
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", paddingVertical: spacing.lg },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  linkRow: { paddingVertical: spacing.sm },
  linkRowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
});
