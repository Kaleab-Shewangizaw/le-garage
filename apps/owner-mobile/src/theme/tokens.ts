/**
 * Design tokens — the same palette as garage-web
 * (apps/garage-web/tailwind.config.ts), translated to plain values since
 * React Native has no CSS. Deliberately restrained: near-black ink on a
 * warm off-white paper, one accent used only for primary actions and
 * things that need attention, plus two desaturated status colors. See
 * docs/OWNER-APP.md §"Visual direction."
 */
export const colors = {
  ink: "#16171B",
  paper: "#FAFAF9",
  surface: "#FFFFFF",
  line: "#E6E4DF",
  graphite: "#6E6D68",
  muted: "#9B9A93",
  signal: "#C2540A",
  signalSoft: "#F5E4D3",
  signalHover: "#A6470A",
  good: "#2F6B4F",
  goodSoft: "#E1EEE7",
  danger: "#A23B2E",
  dangerSoft: "#F3E2DE",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 10,
  full: 999,
};

export const fontFamily = {
  sans: "IBMPlexSans_400Regular",
  sansMedium: "IBMPlexSans_500Medium",
  sansSemibold: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
};

export const fontSize = {
  xs: 11.5,
  sm: 12.5,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
};

export const shadow = {
  subtle: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  raised: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
};
