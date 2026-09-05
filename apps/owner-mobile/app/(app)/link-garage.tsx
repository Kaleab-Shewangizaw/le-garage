import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Building2 } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { useCustomerMatches, useConfirmCustomerLink } from "@/hooks/use-customer-links";
import { humanizeApiError } from "@/lib/api-error";
import { colors, spacing } from "@/theme/tokens";

/**
 * "Is this you?" — the confirm step brief §16/docs/OWNER-APP.md requires:
 * matches are found by phone but never auto-linked (docs/OPEN_QUESTIONS.md
 * #3). Every candidate here needs an explicit tap.
 */
export default function LinkGarageScreen() {
  const matches = useCustomerMatches();
  const confirm = useConfirmCustomerLink();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function handleConfirm(customerId: string) {
    setConfirmingId(customerId);
    try {
      await confirm.mutateAsync(customerId);
      router.back();
    } catch {
      // Error is surfaced inline below via confirm.error; stay on screen.
    } finally {
      setConfirmingId(null);
    }
  }

  if (matches.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Looking for your garage records…" />
      </Screen>
    );
  }

  if (matches.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState message={humanizeApiError(matches.error)} onRetry={() => matches.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">Find your garage records</Text>
      <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
        We looked for records matching your phone number.
      </Text>

      {matches.data?.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="If your garage has your car on file under a different phone number, ask them to update it, then check back here."
        />
      ) : (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {matches.data?.map((m) => (
            <Card key={m.customerId} style={styles.row}>
              <View style={styles.icon}>
                <Building2 color={colors.graphite} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{m.garageName}</Text>
                <Text variant="caption" tone="graphite">
                  Listed as {m.customerFullName}
                </Text>
              </View>
              <Button size="md" onPress={() => handleConfirm(m.customerId)} loading={confirmingId === m.customerId}>
                This is me
              </Button>
            </Card>
          ))}
        </View>
      )}

      {confirm.isError && (
        <Text variant="caption" tone="danger" style={{ marginTop: spacing.md }}>
          {humanizeApiError(confirm.error)}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
});
