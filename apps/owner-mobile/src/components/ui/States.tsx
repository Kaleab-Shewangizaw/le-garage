import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { colors, spacing } from "@/theme/tokens";

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.graphite} />
      {label && (
        <Text variant="caption" tone="graphite" style={{ marginTop: spacing.sm }}>
          {label}
        </Text>
      )}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text variant="body" tone="graphite" style={styles.centerText}>
        {message}
      </Text>
      {onRetry && (
        <View style={{ marginTop: spacing.md }}>
          <Button variant="secondary" size="md" onPress={onRetry}>
            Try again
          </Button>
        </View>
      )}
    </View>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text variant="subheading" style={styles.centerText}>
        {title}
      </Text>
      {description && (
        <Text variant="caption" tone="graphite" style={[styles.centerText, { marginTop: spacing.xs }]}>
          {description}
        </Text>
      )}
      {action && <View style={{ marginTop: spacing.md }}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  centerText: { textAlign: "center" },
});
