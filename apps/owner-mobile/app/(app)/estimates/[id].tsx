import { useMemo, useState } from "react";
import { View, Pressable, Linking, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useJob, useDecideEstimate } from "@/hooks/use-jobs";
import { humanizeApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/format";
import { colors, spacing, radii } from "@/theme/tokens";
import type { EstimateItem } from "@/lib/api-types";

/**
 * The strongest single UX moment in the app (brief §10-11): "I understand
 * what I'm paying for" and "the garage cannot silently add work." Every
 * item defaults to approved (the common case — reviewing and rejecting
 * specific lines is the exception), but per-item control is real, not
 * cosmetic — it's the same itemDecisions array the backend has always
 * supported for staff-logged approvals.
 */
export default function EstimateScreen() {
  const { id: estimateId, jobId } = useLocalSearchParams<{ id: string; jobId: string }>();

  if (!jobId) {
    return (
      <Screen scroll={false}>
        <ErrorState message="This estimate couldn't be found" />
      </Screen>
    );
  }

  return <EstimateContent jobId={jobId} estimateId={estimateId} />;
}

function EstimateContent({ jobId, estimateId }: { jobId: string; estimateId: string }) {
  const job = useJob(jobId);
  const decide = useDecideEstimate(jobId);
  const estimate = job.data?.estimates.find((e) => e.id === estimateId) ?? job.data?.estimates[0];

  const [decisions, setDecisions] = useState<Record<string, "APPROVED" | "REJECTED">>({});
  const [error, setError] = useState<string | null>(null);

  const effectiveDecisions = useMemo(() => {
    if (!estimate) return {};
    const map: Record<string, "APPROVED" | "REJECTED"> = {};
    for (const item of estimate.items) {
      map[item.id] = decisions[item.id] ?? "APPROVED";
    }
    return map;
  }, [estimate, decisions]);

  if (job.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (!estimate) {
    return (
      <Screen scroll={false}>
        <ErrorState message="This estimate couldn't be found" />
      </Screen>
    );
  }

  const alreadyDecided = estimate.status === "APPROVED" || estimate.status === "REJECTED";
  const garagePhone = job.data?.organization.garage?.phone;

  async function submit(finalize: "APPROVED" | "REJECTED" | null) {
    setError(null);
    const itemDecisions = Object.entries(finalize ? Object.fromEntries(estimate!.items.map((i) => [i.id, finalize])) : effectiveDecisions).map(
      ([estimateItemId, decision]) => ({ estimateItemId, decision }),
    );
    try {
      await decide.mutateAsync({ estimateId, itemDecisions });
      router.back();
    } catch (err) {
      setError(humanizeApiError(err));
    }
  }

  return (
    <Screen>
      <Text variant="title">Estimate</Text>
      <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
        Recommended work for {job.data?.vehicle.make} {job.data?.vehicle.model}
      </Text>

      {alreadyDecided && (
        <View style={{ marginTop: spacing.md }}>
          <Badge tone={estimate.status === "APPROVED" ? "good" : "danger"}>{estimate.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
        </View>
      )}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        {estimate.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            decision={effectiveDecisions[item.id]}
            editable={!alreadyDecided}
            onChange={(d) => setDecisions((prev) => ({ ...prev, [item.id]: d }))}
          />
        ))}
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.totalRow}>
          <Text variant="bodyMedium">Total</Text>
          <Text variant="heading">{formatMoney(estimate.total, estimate.currency)}</Text>
        </View>
      </Card>

      {!alreadyDecided && (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Button onPress={() => submit(null)} loading={decide.isPending}>
            Approve
          </Button>
          <Button variant="secondary" onPress={() => submit("REJECTED")} loading={decide.isPending}>
            Reject all
          </Button>
          {garagePhone && (
            <Button variant="ghost" onPress={() => Linking.openURL(`tel:${garagePhone}`)}>
              Ask the garage
            </Button>
          )}
        </View>
      )}

      {error && (
        <Text variant="caption" tone="danger" style={{ marginTop: spacing.md }}>
          {error}
        </Text>
      )}

      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xl, textAlign: "center" }}>
        Approving means the garage can proceed with this work — nothing outside this estimate.
      </Text>
    </Screen>
  );
}

function ItemRow({
  item,
  decision,
  editable,
  onChange,
}: {
  item: EstimateItem;
  decision: "APPROVED" | "REJECTED";
  editable: boolean;
  onChange: (d: "APPROVED" | "REJECTED") => void;
}) {
  return (
    <Card style={styles.itemRow}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{item.description}</Text>
        <Text variant="caption" tone="graphite">
          {item.type === "PART" ? "Part" : "Labor"}
          {item.quantity > 1 ? ` × ${item.quantity}` : ""} · {formatMoney(item.lineTotal)}
        </Text>
      </View>
      {editable ? (
        <View style={styles.toggleGroup}>
          <Pressable onPress={() => onChange("APPROVED")} style={[styles.toggle, decision === "APPROVED" && styles.toggleActiveGood]}>
            <Text variant="caption" tone={decision === "APPROVED" ? "paper" : "graphite"}>
              Approve
            </Text>
          </Pressable>
          <Pressable onPress={() => onChange("REJECTED")} style={[styles.toggle, decision === "REJECTED" && styles.toggleActiveDanger]}>
            <Text variant="caption" tone={decision === "REJECTED" ? "paper" : "graphite"}>
              Reject
            </Text>
          </Pressable>
        </View>
      ) : (
        <Badge tone={decision === "APPROVED" ? "good" : "danger"}>{decision}</Badge>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toggleGroup: { flexDirection: "row", gap: 4 },
  toggle: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.paper },
  toggleActiveGood: { backgroundColor: colors.good },
  toggleActiveDanger: { backgroundColor: colors.danger },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
