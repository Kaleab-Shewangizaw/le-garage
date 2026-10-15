import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { colors, radii, spacing } from "@/theme/tokens";

export type BadgeTone = "neutral" | "attention" | "good" | "danger";

const bg: Record<BadgeTone, string> = {
  neutral: colors.line,
  attention: colors.signalSoft,
  good: colors.goodSoft,
  danger: colors.dangerSoft,
};
const fg: Record<BadgeTone, "graphite" | "signal" | "good" | "danger"> = {
  neutral: "graphite",
  attention: "signal",
  good: "good",
  danger: "danger",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg[tone] }]}>
      <Text variant="caption" tone={fg[tone]} style={styles.label}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: { fontSize: 11.5 },
});
