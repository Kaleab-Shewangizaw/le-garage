import type { Config } from "tailwindcss";

/**
 * Design tokens for Le Garage's garage-web app — see docs/UX.md for the
 * principles behind them. Deliberately restrained: near-black ink on a
 * warm off-white paper, one accent (a dashboard-gauge amber/copper) used
 * only for primary actions and things that need attention, plus two
 * desaturated status colors (good/danger). Everything else is grayscale.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16171B",
        paper: "#FAFAF9",
        surface: "#FFFFFF",
        line: "#E6E4DF",
        graphite: "#6E6D68",
        muted: "#9B9A93",
        signal: {
          DEFAULT: "#C2540A",
          soft: "#F5E4D3",
          hover: "#A6470A",
        },
        good: {
          DEFAULT: "#2F6B4F",
          soft: "#E1EEE7",
        },
        danger: {
          DEFAULT: "#A23B2E",
          soft: "#F3E2DE",
        },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(22 23 27 / 0.04)",
        raised: "0 2px 8px -2px rgb(22 23 27 / 0.10), 0 1px 2px -1px rgb(22 23 27 / 0.06)",
        overlay: "0 12px 32px -8px rgb(22 23 27 / 0.20), 0 4px 12px -4px rgb(22 23 27 / 0.10)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
