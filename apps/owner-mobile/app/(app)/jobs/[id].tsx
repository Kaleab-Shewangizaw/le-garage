import { View, Pressable, Image, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ChevronRight, Camera } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { ProgressTimeline } from "@/components/ProgressTimeline";
import { useJob } from "@/hooks/use-jobs";
import { useAttachmentUrl } from "@/hooks/use-attachments";
import { statusHeadline, statusDescription, progressStages, isJobActive, approvalMethodLabel, resolveDisplayStatus } from "@/lib/job-copy";
import { humanizeApiError } from "@/lib/api-error";
import { formatDateTime, formatMoney, formatMileage } from "@/lib/format";
import { colors, spacing, radii } from "@/theme/tokens";
import type { OwnerAttachment } from "@/lib/api-types";

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);

  if (job.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (job.isError || !job.data) {
    return (
      <Screen scroll={false}>
        <ErrorState message={job.error ? humanizeApiError(job.error) : "This repair couldn't be found"} onRetry={() => job.refetch()} />
      </Screen>
    );
  }

  const j = job.data;
  const latestEstimate = j.estimates[0];
  const latestInvoice = j.invoices[0];
  const needsApproval = j.status === "WAITING_APPROVAL" && latestEstimate?.status === "SENT";
  const displayStatus = resolveDisplayStatus(j);
  // A REJECTED estimate has no dedicated JobStatus of its own (staff still
  // needs to revise it or follow up) — the timeline correctly stays at
  // "waiting," but the headline shouldn't keep asking for an approval the
  // owner already declined.
  const justRejected = j.status === "WAITING_APPROVAL" && latestEstimate?.status === "REJECTED";
  const headline = justRejected ? "Estimate declined" : statusHeadline(displayStatus);
  const description = justRejected ? "Let the garage know if you'd like to discuss the estimate." : statusDescription(displayStatus);

  return (
    <Screen onRefresh={() => job.refetch()} refreshing={job.isFetching}>
      <Text variant="caption" tone="graphite">
        {j.vehicle.make} {j.vehicle.model} · {j.vehicle.licensePlate}
      </Text>
      <Text variant="title" style={{ marginTop: 2 }}>
        {headline}
      </Text>
      <Text variant="body" tone="graphite" style={{ marginTop: spacing.xs }}>
        {description}
      </Text>

      {isJobActive(j.status) && (
        <View style={{ marginTop: spacing.xl }}>
          <ProgressTimeline stages={progressStages({ ...j, status: displayStatus })} />
        </View>
      )}

      <Section title="What you told us">
        <Text variant="body">{j.complaint}</Text>
        {j.mileageAtIntake != null && (
          <Text variant="caption" tone="graphite" style={{ marginTop: spacing.xs }}>
            Mileage at check-in: {formatMileage(j.mileageAtIntake)}
          </Text>
        )}
      </Section>

      {j.diagnoses.length > 0 && (
        <Section title="What we found">
          {j.diagnoses.map((d) => (
            <View key={d.id} style={{ marginBottom: spacing.sm }}>
              <Text variant="body">{d.observedProblem}</Text>
              {d.recommendedRepair && (
                <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
                  Recommended: {d.recommendedRepair}
                </Text>
              )}
            </View>
          ))}
        </Section>
      )}

      {needsApproval && (
        <Pressable onPress={() => router.push({ pathname: "/(app)/estimates/[id]", params: { id: latestEstimate.id, jobId: j.id } })}>
          <Card raised style={styles.approvalCard}>
            <View style={{ flex: 1 }}>
              <Badge tone="attention">Your approval is needed</Badge>
              <Text variant="bodyMedium" style={{ marginTop: spacing.sm }}>
                Review the estimate — {formatMoney(latestEstimate.total, latestEstimate.currency)}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </Card>
        </Pressable>
      )}

      {latestEstimate && !needsApproval && (
        <Section title="Estimate">
          <View style={styles.rowBetween}>
            <Text variant="body">Total</Text>
            <Text variant="bodyMedium">{formatMoney(latestEstimate.total, latestEstimate.currency)}</Text>
          </View>
          <Badge tone={latestEstimate.status === "APPROVED" ? "good" : latestEstimate.status === "REJECTED" ? "danger" : "neutral"}>
            {latestEstimate.status}
          </Badge>
        </Section>
      )}

      {j.approvals.length > 0 && (
        <Section title="Approval">
          {j.approvals.map((a) => (
            <View key={a.id} style={{ marginBottom: spacing.xs }}>
              <Text variant="caption" tone="graphite">
                {approvalMethodLabel(a.method)} · {formatDateTime(a.createdAt)}
              </Text>
              {a.note && <Text variant="caption">&quot;{a.note}&quot;</Text>}
            </View>
          ))}
          <Text variant="caption" tone="good" style={{ marginTop: spacing.xs }}>
            The garage can now proceed with this work.
          </Text>
        </Section>
      )}

      {latestInvoice && (
        <Section title="Invoice">
          <View style={styles.rowBetween}>
            <Text variant="body">Total</Text>
            <Text variant="bodyMedium">{formatMoney(latestInvoice.total, latestInvoice.currency)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text variant="body">Paid</Text>
            <Text variant="bodyMedium" tone={paidInFull(latestInvoice) ? "good" : "ink"}>
              {formatMoney(latestInvoice.payments.reduce((s, p) => s + p.amount, 0), latestInvoice.currency)}
            </Text>
          </View>
          {paidInFull(latestInvoice) && (
            <Badge tone="good">Paid in full</Badge>
          )}
        </Section>
      )}

      {j.attachments.length > 0 && (
        <Section title="Photos">
          <View style={styles.photoGrid}>
            {j.attachments
              .filter((a) => a.mimeType.startsWith("image/"))
              .map((a) => (
                <PhotoThumb key={a.id} attachment={a} />
              ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}

function paidInFull(invoice: { total: number; payments: { amount: number }[] }) {
  return invoice.payments.reduce((s, p) => s + p.amount, 0) >= invoice.total && invoice.total > 0;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text variant="eyebrow" tone="muted" style={{ marginBottom: spacing.sm }}>
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

function PhotoThumb({ attachment }: { attachment: OwnerAttachment }) {
  const signed = useAttachmentUrl(attachment.id);
  if (!signed.data?.url) {
    return (
      <View style={styles.photoPlaceholder}>
        <Camera color={colors.muted} size={16} />
      </View>
    );
  }
  return <Image source={{ uri: signed.data.url }} style={styles.photo} />;
}

const styles = StyleSheet.create({
  approvalCard: { flexDirection: "row", alignItems: "center", marginTop: spacing.xl, backgroundColor: colors.signalSoft, borderColor: colors.signal },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radii.md },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
});
