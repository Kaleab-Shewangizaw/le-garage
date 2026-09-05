import { Text as RNText, type TextProps, StyleSheet } from "react-native";
import { colors, fontFamily, fontSize } from "@/theme/tokens";

type Variant = "title" | "heading" | "subheading" | "body" | "bodyMedium" | "caption" | "eyebrow" | "mono" | "monoMedium";
type Tone = "ink" | "graphite" | "muted" | "paper" | "signal" | "good" | "danger";

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

const variantStyles = StyleSheet.create({
  title: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.xxl, letterSpacing: -0.3 },
  heading: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.xl, letterSpacing: -0.2 },
  subheading: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md },
  body: { fontFamily: fontFamily.sans, fontSize: fontSize.base, lineHeight: fontSize.base * 1.45 },
  bodyMedium: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.base },
  caption: { fontFamily: fontFamily.sans, fontSize: fontSize.sm },
  eyebrow: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, letterSpacing: 0.6, textTransform: "uppercase" },
  mono: { fontFamily: fontFamily.mono, fontSize: fontSize.sm },
  monoMedium: { fontFamily: fontFamily.monoMedium, fontSize: fontSize.sm },
});

const toneColors: Record<Tone, string> = {
  ink: colors.ink,
  graphite: colors.graphite,
  muted: colors.muted,
  paper: colors.paper,
  signal: colors.signal,
  good: colors.good,
  danger: colors.danger,
};

export function Text({ variant = "body", tone = "ink", style, ...props }: Props) {
  return <RNText style={[variantStyles[variant], { color: toneColors[tone] }, style]} {...props} />;
}
