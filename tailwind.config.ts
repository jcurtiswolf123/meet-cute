import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Warm Daylight" palette. Token NAMES are preserved (cream/paper/ink/
        // line/muted) so the whole token-based component layer re-skins in place;
        // the VALUES are sunlit and warm: cream/paper are a warm morning canvas +
        // sand band, ink is a soft espresso brown (never pure black), line is a
        // warm hairline. The feel is a bright, inviting cafe, not a dim bar.
        cream: "#fbf5ec", // app canvas (warm morning cream)
        paper: "#f4e8d7", // raised section band (soft sand)
        panel: "#fffdf8", // cards / surfaces (warm white)
        ink: "#382a20", // soft espresso brown (primary text)
        muted: "#7d6f62", // warm taupe (secondary text)
        line: "#ecdcc7", // warm hairline / borders
        // Terracotta: the single dominant accent (warm clay). Primary CTAs use it
        // with cream text for a friendly, hand-warmed read.
        ember: { DEFAULT: "#d76a45", soft: "#e79b78", deep: "#b64d2c" },
        // Warm rose: romantic secondary accent (the heart, hairlines, hovers).
        claret: { DEFAULT: "#cf6a71", dark: "#b24e58", soft: "#e6989d" },
        sage: "#7f8d67",
        // Espresso: warm deep brown, used for text-on-light-photo and rich edges.
        espresso: { DEFAULT: "#2c2019", deep: "#241a13" },
        champagne: { DEFAULT: "#eec48a", soft: "#f6ddb6" },
        blush: "#f3d9cf",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        // Soft, warm-tinted elevation for a light canvas (no harsh black drop).
        card: "0 1px 0 rgba(255,255,255,0.6) inset, 0 20px 44px -24px rgba(120,74,46,0.28)",
        glow: "0 0 0 1px rgba(215,106,69,0.16), 0 12px 40px -12px rgba(215,106,69,0.28)",
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
