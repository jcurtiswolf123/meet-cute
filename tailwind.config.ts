import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Nightcap" dark palette. Token NAMES are preserved (cream/paper/ink/
        // line/muted) so the whole token-based component layer re-skins, but
        // their VALUES are flipped dark: cream/paper are now the near-black plum
        // canvas + panels, ink is candlelight off-white, line is a dark hairline.
        cream: "#161013", // app canvas (near-black plum)
        paper: "#221a1f", // raised section band
        panel: "#1e171b", // cards / surfaces (replaces literal bg-white)
        ink: "#f4ece2", // candlelight off-white (primary text)
        muted: "#a3978a", // secondary text on dark
        line: "#3a2f34", // hairline / borders on dark
        // Ember amber: the single dominant accent (candleflame). Primary CTAs use
        // it with dark ink text for a premium gold-foil read.
        ember: { DEFAULT: "#e6a94e", soft: "#f0c889", deep: "#c98a2f" },
        // Garnet rose: romantic secondary accent (the heart, hairlines, hovers).
        claret: { DEFAULT: "#d6536b", dark: "#b23e54", soft: "#e58195" },
        sage: "#8fa07f",
        espresso: { DEFAULT: "#120c0e", deep: "#0c0809" },
        champagne: { DEFAULT: "#e6a94e", soft: "#f0c889" },
        blush: "#e58195",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 18px 40px -18px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(230,169,78,0.18), 0 10px 40px -10px rgba(230,169,78,0.25)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(0.22, 1, 0.36, 1)" },
      fontSize: {
        xs: ["12px", { lineHeight: "1.5" }],
        sm: ["14px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.6" }],
        lg: ["18px", { lineHeight: "1.6" }],
        xl: ["20px", { lineHeight: "1.5" }],
        "2xl": ["24px", { lineHeight: "1.4" }],
        "3xl": ["30px", { lineHeight: "1.3" }],
        "4xl": ["36px", { lineHeight: "1.2" }],
        "5xl": ["48px", { lineHeight: "1.1" }],
        "6xl": ["60px", { lineHeight: "1.05" }],
      },
      spacing: {
        "section-sm": "48px",
        "section-md": "80px",
        "section-lg": "120px",
      },
    },
  },
  plugins: [],
} satisfies Config;
