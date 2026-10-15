import { View, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useVehicle } from "@/hooks/use-vehicles";
import { statusHeadline } from "@/lib/job-copy";
import { humanizeApiError } from "@/lib/api-error";
import { formatDate, formatMileage, formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useVehicle(id);

  if (vehicle.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (vehicle.isError || !vehicle.data) {
    return (
      <Screen scroll={false}>
        <ErrorState message={vehicle.error ? humanizeApiError(vehicle.error) : "Vehicle not found"} onRetry={() => vehicle.refetch()} />
      </Screen>
    );
  }

  const v = vehicle.data;

  return (
    <Screen onRefresh={() => vehicle.refetch()} refreshing={vehicle.isFetching}>
      <Text variant="title">
        {v.make} {v.model}
        {v.year ? ` (${v.year})` : ""}
      </Text>
      <View style={styles.metaRow}>
        <Text variant="mono" tone="graphite">
          {v.licensePlate}
        </Text>
        <Text variant="caption" tone="graphite">
          {formatMileage(v.lastKnownMileage)}
        </Text>
      </View>
      {v.vin && (
        <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
          VIN {v.vin}
        </Text>
      )}

      {v.activeJob && (
        <Pressable onPress={() => router.push(`/(app)/jobs/${v.activeJob!.id}`)} style={{ marginTop: spacing.lg }}>
          <Card raised style={styles.activeRow}>
            <View style={{ flex: 1 }}>
              <Text variant="eyebrow" tone="muted">
                Current repair
              </Text>
              <Text variant="bodyMedium" style={{ marginTop: 2 }}>
                {statusHeadline(v.activeJob.status as never)}
              </Text>
              <Text variant="caption" tone="graphite">
                {v.activeJob.garageName}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={18} />
          </Card>
        </Pressable>
      )}

      <Text variant="eyebrow" tone="muted" style={styles.sectionLabel}>
        Service history
      </Text>
      {v.serviceHistory.length === 0 ? (
        <Card>
          <Text variant="caption" tone="graphite">
            No service records yet.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {v.serviceHistory.map((entry) => (
            <Card key={entry.id}>
              <Text variant="caption" tone="graphite">
                {formatDate(entry.serviceDate)} · {entry.garageName ?? "Garage"}
              </Text>
              <Text variant="bodyMedium" style={{ marginTop: 2 }}>
                {entry.summary.complaint ?? entry.summary.diagnoses?.[0]?.observedProblem ?? "Service"}
              </Text>
              {entry.summary.invoice && (
                <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
                  {formatMoney(entry.summary.invoice.total, entry.summary.invoice.currency)}
                  {entry.mileage ? ` · ${formatMileage(entry.mileage)}` : ""}
                </Text>
              )}
              <Badge tone="good">
                {(entry.summary.warrantyMonths ?? 0) > 0 ? `${entry.summary.warrantyMonths}mo warranty` : "Completed"}
              </Badge>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  activeRow: { flexDirection: "row", alignItems: "center" },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
});
