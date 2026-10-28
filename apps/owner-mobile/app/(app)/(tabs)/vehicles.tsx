import { View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Car, ChevronRight, Plus } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { useVehicles } from "@/hooks/use-vehicles";
import { statusHeadline } from "@/lib/job-copy";
import { humanizeApiError } from "@/lib/api-error";
import { formatMileage } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";

export default function VehiclesScreen() {
  const vehicles = useVehicles();

  if (vehicles.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (vehicles.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState message={humanizeApiError(vehicles.error)} onRetry={() => vehicles.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => vehicles.refetch()} refreshing={vehicles.isFetching}>
      <View style={styles.header}>
        <Text variant="title">My vehicles</Text>
        <Pressable onPress={() => router.push("/(app)/link-garage")} hitSlop={10}>
          <Plus color={colors.ink} size={22} />
        </Pressable>
      </View>

      {vehicles.data?.length === 0 ? (
        <EmptyState
          title="Your garage starts here."
          description="Add your vehicle to keep its service history in one place."
          action={
            <Button variant="secondary" size="md" onPress={() => router.push("/(app)/link-garage")}>
              Find my garage records
            </Button>
          }
        />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {vehicles.data?.map((v) => (
            <Pressable key={v.id} onPress={() => router.push(`/(app)/vehicles/${v.id}`)}>
              <Card style={styles.row}>
                <View style={styles.icon}>
                  <Car color={colors.graphite} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">
                    {v.make} {v.model}
                    {v.year ? ` (${v.year})` : ""}
                  </Text>
                  <Text variant="caption" tone="graphite" style={{ marginTop: 1 }}>
                    {v.licensePlate} · {formatMileage(v.lastKnownMileage)}
                  </Text>
                  {v.activeJob && (
                    <View style={{ marginTop: spacing.xs }}>
                      <Badge tone={v.activeJob.status === "WAITING_APPROVAL" ? "attention" : "neutral"}>
                        {statusHeadline(v.activeJob.status as never)}
                      </Badge>
                    </View>
                  )}
                </View>
                <ChevronRight color={colors.muted} size={18} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
});
