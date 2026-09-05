import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/ui/States";
import { Screen } from "@/components/ui/Screen";

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
