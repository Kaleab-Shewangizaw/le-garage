import { View, type ViewProps, StyleSheet } from "react-native";
import { colors, radii, spacing, shadow } from "@/theme/tokens";

interface Props extends ViewProps {
  raised?: boolean;
}

export function Card({ style, raised, ...props }: Props) {
  return <View style={[styles.base, raised && shadow.raised, style]} {...props} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
});
