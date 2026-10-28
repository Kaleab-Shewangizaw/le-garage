import { Pressable, ActivityIndicator, StyleSheet, type PressableProps } from "react-native";
import { Text } from "./Text";
import { colors, radii, fontFamily, fontSize } from "@/theme/tokens";

type Variant = "primary" | "signal" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

interface Props extends Omit<PressableProps, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: string;
}

const bg: Record<Variant, string> = {
  primary: colors.ink,
  signal: colors.signal,
  secondary: colors.surface,
  ghost: "transparent",
  danger: colors.danger,
};

const textTone: Record<Variant, "paper" | "ink"> = {
  primary: "paper",
  signal: "paper",
  secondary: "ink",
  ghost: "ink",
  danger: "paper",
};

export function Button({ variant = "primary", size = "lg", loading, disabled, children, style, ...props }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        { backgroundColor: bg[variant] },
        variant === "secondary" && styles.secondaryBorder,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        typeof style === "function" ? undefined : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={textTone[variant] === "paper" ? colors.paper : colors.ink} size="small" />
      ) : (
        <Text variant="bodyMedium" tone={textTone[variant]} style={styles.label}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  lg: { minHeight: 50, paddingHorizontal: 20 },
  md: { minHeight: 44, paddingHorizontal: 16 },
  secondaryBorder: { borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.base },
});
