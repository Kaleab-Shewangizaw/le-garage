import { Pressable, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Card } from "./ui/Card";
import { Text } from "./ui/Text";
import { Badge } from "./ui/Badge";
import { ProgressTimeline } from "./ProgressTimeline";
import { statusHeadline, statusDescription, progressStages, isJobActive, resolveDisplayStatus } from "@/lib/job-copy";
import { colors, spacing } from "@/theme/tokens";
import type { OwnerJob } from "@/lib/api-types";

type JobLike = Pick<
  OwnerJob,
  "id" | "status" | "vehicle" | "estimates" | "diagnosingAt" | "waitingApprovalAt" | "approvedAt" | "inProgressAt" | "qualityCheckAt" | "readyAt"
>;

export function ActiveJobCard({ job }: { job: JobLike }) {
  const displayStatus = resolveDisplayStatus(job);
  const needsApproval = job.status === "WAITING_APPROVAL" && job.estimates[0]?.status === "SENT";

  return (
    <Pressable onPress={() => router.push(`/jobs/${job.id}`)}>
      <Card raised style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="graphite">
              Your {job.vehicle.make} {job.vehicle.model}
            </Text>
            <Text variant="heading" style={{ marginTop: 2 }}>
              {statusHeadline(displayStatus)}
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={20} />
        </View>

        <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
          {statusDescription(displayStatus)}
        </Text>

        {isJobActive(job.status) && (
          <View style={{ marginTop: spacing.lg }}>
            <ProgressTimeline stages={progressStages({ ...job, status: displayStatus })} />
          </View>
        )}

        {needsApproval && (
          <View style={{ marginTop: spacing.md }}>
            <Badge tone="attention">Review estimate</Badge>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
});
