import { View, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { Car, LifeBuoy, MapPin, Bell } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { ActiveJobCard } from "@/components/ActiveJobCard";
import { useVehicles } from "@/hooks/use-vehicles";
import { useJob } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { humanizeApiError } from "@/lib/api-error";
import { formatMileage } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";

export default function HomeScreen() {
  const { me } = useAuth();
  const vehicles = useVehicles();
  const notifications = useNotifications();
  const firstName = me?.fullName?.split(" ")[0];

  const activeVehicles = vehicles.data?.filter((v) => v.activeJob) ?? [];
  const firstActiveJobId = activeVehicles[0]?.activeJob?.id;
  const activeJob = useJob(firstActiveJobId);

  if (vehicles.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading your account…" />
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
      <View style={styles.topRow}>
        <Text variant="caption" tone="graphite">
          Hello{firstName ? `, ${firstName}` : ""}
        </Text>
        <Pressable onPress={() => router.push("/(app)/notifications")} hitSlop={10}>
          <View>
            <Bell color={colors.ink} size={22} />
            {!!notifications.data?.unreadCount && <View style={styles.dot} />}
          </View>
        </Pressable>
      </View>

      {vehicles.data?.length === 0 ? (
        <EmptyState
          title="Your garage starts here."
          description="Once a garage checks in your vehicle, it will show up here automatically."
          action={
            <Button variant="secondary" size="md" onPress={() => router.push("/(app)/link-garage")}>
              Find my garage records
            </Button>
          }
        />
      ) : activeJob.data ? (
        <View style={{ marginTop: spacing.md }}>
          <ActiveJobCard job={activeJob.data} />
        </View>
      ) : (
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="subheading">No active repairs</Text>
          <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
            You&apos;ll see it here the moment a garage checks in one of your vehicles.
          </Text>
        </Card>
      )}

      <Text variant="eyebrow" tone="muted" style={styles.sectionLabel}>
        Your vehicles
      </Text>
      <View style={{ gap: spacing.sm }}>
        {vehicles.data?.map((v) => (
          <Pressable key={v.id} onPress={() => router.push(`/(app)/vehicles/${v.id}`)}>
            <Card style={styles.vehicleRow}>
              <View style={styles.vehicleIcon}>
                <Car color={colors.graphite} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">
                  {v.make} {v.model}
                  {v.year ? ` (${v.year})` : ""}
                </Text>
                <Text variant="caption" tone="graphite">
                  {v.licensePlate} · {formatMileage(v.lastKnownMileage)}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text variant="eyebrow" tone="muted" style={styles.sectionLabel}>
        Quick actions
      </Text>
      <View style={styles.actionsGrid}>
        <ActionTile icon={<LifeBuoy color={colors.graphite} size={20} />} label="I need help" onPress={() => router.push("/profile")} />
        <ActionTile icon={<MapPin color={colors.graphite} size={20} />} label="Find a garage" disabled />
      </View>
    </Screen>
  );
}

function ActionTile({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1 }}>
      <Card style={[styles.actionTile, disabled && { opacity: 0.5 }]}>
        {icon}
        <Text variant="caption" tone="ink" style={{ marginTop: spacing.xs }}>
          {label}
        </Text>
        {disabled && (
          <Text variant="caption" tone="muted" style={{ fontSize: 10 }}>
            Coming soon
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  vehicleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  actionsGrid: { flexDirection: "row", gap: spacing.sm },
  actionTile: { alignItems: "center", paddingVertical: spacing.lg },
});
