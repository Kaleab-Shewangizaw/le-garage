import { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useQueries } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { useVehicles } from "@/hooks/use-vehicles";
import { api } from "@/lib/api-client";
import { humanizeApiError } from "@/lib/api-error";
import { formatDate, formatMileage, formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";
import type { OwnerVehicleDetail, ServiceHistoryEntry } from "@/lib/api-types";

export default function HistoryScreen() {
  const vehicles = useVehicles();

  const details = useQueries({
    queries: (vehicles.data ?? []).map((v) => ({
      queryKey: ["vehicles", v.id],
      queryFn: () => api.get<OwnerVehicleDetail>(`/owner/vehicles/${v.id}`),
      enabled: !!vehicles.data,
    })),
  });

  if (vehicles.isLoading || details.some((d) => d.isLoading)) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading service history…" />
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

  const entries = details
    .flatMap((d, i) => (d.data?.serviceHistory ?? []).map((entry) => ({ entry, vehicle: vehicles.data![i] })))
    .sort((a, b) => new Date(b.entry.serviceDate).getTime() - new Date(a.entry.serviceDate).getTime());

  return (
    <Screen>
      <Text variant="title">Service history</Text>

      {entries.length === 0 ? (
        <EmptyState title="No service records yet" description="Completed work on your vehicles will appear here permanently." />
      ) : (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {entries.map(({ entry, vehicle }) => (
            <HistoryCard key={entry.id} entry={entry} vehicleLabel={`${vehicle.make} ${vehicle.model}`} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function HistoryCard({ entry, vehicleLabel }: { entry: ServiceHistoryEntry; vehicleLabel: string }) {
  const [open, setOpen] = useState(false);
  const workTitle = entry.summary.complaint ?? entry.summary.diagnoses?.[0]?.observedProblem ?? "Service";

  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="graphite">
              {formatDate(entry.serviceDate)} · {vehicleLabel}
            </Text>
            <Text variant="bodyMedium" style={{ marginTop: 2 }}>
              {workTitle}
            </Text>
            <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
              {entry.garageName ?? "Garage"}
              {entry.summary.invoice ? ` · ${formatMoney(entry.summary.invoice.total, entry.summary.invoice.currency)}` : ""}
              {entry.mileage ? ` · ${formatMileage(entry.mileage)}` : ""}
            </Text>
          </View>
          {open ? <ChevronUp color={colors.muted} size={18} /> : <ChevronDown color={colors.muted} size={18} />}
        </View>
      </Pressable>

      {open && (
        <View style={styles.details}>
          {entry.summary.diagnoses?.map((d, i) => (
            <View key={i} style={styles.detailBlock}>
              <Text variant="eyebrow" tone="muted">
                What we found
              </Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {d.observedProblem}
              </Text>
              {d.recommendedRepair && (
                <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
                  Recommended: {d.recommendedRepair}
                </Text>
              )}
            </View>
          ))}

          {!!entry.summary.workPerformed?.parts?.length && (
            <View style={styles.detailBlock}>
              <Text variant="eyebrow" tone="muted">
                Parts
              </Text>
              {entry.summary.workPerformed.parts.map((p, i) => (
                <Text key={i} variant="caption" tone="ink" style={{ marginTop: 2 }}>
                  {p.name}
                  {p.brand ? ` (${p.brand})` : ""} × {p.quantity}
                  {p.warrantyMonths ? ` — ${p.warrantyMonths}mo warranty` : ""}
                </Text>
              ))}
            </View>
          )}

          {!!entry.summary.workPerformed?.labor?.length && (
            <View style={styles.detailBlock}>
              <Text variant="eyebrow" tone="muted">
                Labor
              </Text>
              {entry.summary.workPerformed.labor.map((l, i) => (
                <Text key={i} variant="caption" tone="ink" style={{ marginTop: 2 }}>
                  {l.description}
                  {l.hours ? ` — ${l.hours}h` : ""}
                </Text>
              ))}
            </View>
          )}

          {entry.summary.invoice && (
            <View style={styles.detailBlock}>
              <Text variant="eyebrow" tone="muted">
                Cost
              </Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {formatMoney(entry.summary.invoice.total, entry.summary.invoice.currency)}
                {entry.summary.invoice.balance > 0 ? ` (${formatMoney(entry.summary.invoice.balance)} outstanding)` : " — paid in full"}
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  details: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.sm },
  detailBlock: {},
});
