import { View, StyleSheet } from "react-native";
import { Text } from "./ui/Text";
import { colors, spacing } from "@/theme/tokens";
import type { ProgressStage } from "@/lib/job-copy";

const DOT_SIZE = 12;

export function ProgressTimeline({ stages }: { stages: ProgressStage[] }) {
  const doneCount = stages.filter((s) => s.state === "done").length;
  const currentIndex = stages.findIndex((s) => s.state === "current");
  // Progress fraction stops at the *center* of the current dot, not past it.
  const progressFraction = stages.length <= 1 ? 0 : (doneCount + (currentIndex >= 0 ? 0.5 : 0)) / (stages.length - 1);

  return (
    <View>
      <View style={styles.trackWrap}>
        <View style={styles.trackBackground} />
        <View style={[styles.trackFill, { width: `${Math.min(100, progressFraction * 100)}%` }]} />
        <View style={styles.dotsRow}>
          {stages.map((stage) => (
            <View
              key={stage.key}
              style={[styles.dot, stage.state === "done" && styles.dotDone, stage.state === "current" && styles.dotCurrent]}
            />
          ))}
        </View>
      </View>
      <View style={styles.labelsRow}>
        {stages.map((stage) => (
          <Text key={stage.key} variant="caption" tone={stage.state === "upcoming" ? "muted" : "ink"} style={styles.label} numberOfLines={2}>
            {stage.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: { height: DOT_SIZE, justifyContent: "center" },
  trackBackground: { position: "absolute", left: DOT_SIZE / 2, right: DOT_SIZE / 2, height: 2, backgroundColor: colors.line },
  trackFill: { position: "absolute", left: DOT_SIZE / 2, height: 2, backgroundColor: colors.ink },
  dotsRow: { flexDirection: "row", justifyContent: "space-between" },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.line,
  },
  dotDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  dotCurrent: { backgroundColor: colors.signal, borderColor: colors.signal },
  labelsRow: { flexDirection: "row", marginTop: spacing.xs },
  label: { flex: 1, textAlign: "center", fontSize: 10, lineHeight: 13 },
});
