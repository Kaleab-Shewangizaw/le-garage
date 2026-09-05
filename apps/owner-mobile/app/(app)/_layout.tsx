import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { Screen } from "@/components/ui/Screen";
import { LoadingState } from "@/components/ui/States";
import { colors } from "@/theme/tokens";

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="link-garage" options={{ presentation: "modal" }} />
      <Stack.Screen name="vehicles/[id]" options={{ headerShown: true, title: "Vehicle" }} />
      <Stack.Screen name="jobs/[id]" options={{ headerShown: true, title: "Repair" }} />
      <Stack.Screen name="estimates/[id]" options={{ headerShown: true, title: "Estimate", presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
    </Stack>
  );
}
