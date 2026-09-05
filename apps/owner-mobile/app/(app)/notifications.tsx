import { View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Card } from "@/components/ui/Card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-notifications";
import { humanizeApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";
import type { OwnerNotification } from "@/lib/api-types";

export default function NotificationsScreen() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();

  if (notifications.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (notifications.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState message={humanizeApiError(notifications.error)} onRetry={() => notifications.refetch()} />
      </Screen>
    );
  }

  const items = notifications.data?.items ?? [];

  function handlePress(n: OwnerNotification) {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.payload?.jobId) router.push(`/(app)/jobs/${n.payload.jobId}`);
  }

  return (
    <Screen onRefresh={() => notifications.refetch()} refreshing={notifications.isFetching}>
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" description="You'll hear from us the moment something happens with your car." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((n) => (
            <Pressable key={n.id} onPress={() => handlePress(n)}>
              <Card style={!n.readAt ? styles.unread : undefined}>
                <View style={styles.row}>
                  {!n.readAt && <View style={styles.dot} />}
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{n.title}</Text>
                    <Text variant="caption" tone="graphite" style={{ marginTop: 2 }}>
                      {n.body}
                    </Text>
                    <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                      {formatDateTime(n.createdAt)}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unread: { borderColor: colors.signal },
  row: { flexDirection: "row", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal, marginTop: 6 },
});
