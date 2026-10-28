import { View, StyleSheet } from "react-native";
import { Text } from "./ui/Text";
import { colors } from "@/theme/tokens";

export function InitialsCircle({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text variant="bodyMedium" tone="paper" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
});
