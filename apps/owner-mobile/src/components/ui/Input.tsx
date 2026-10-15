import { TextInput, View, StyleSheet, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { colors, radii, spacing, fontFamily, fontSize } from "@/theme/tokens";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      {label && (
        <Text variant="caption" tone="graphite" style={styles.label}>
          {label}
        </Text>
      )}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      {error && (
        <Text variant="caption" tone="danger" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fontFamily.sansMedium },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  error: { marginTop: 2 },
});
