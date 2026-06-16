import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#faf7f2",
        paper: "#f3ede3",
        ink: "#1f1a16",
        muted: "#6b6258",
        line: "#e4dccf",
        claret: {
          DEFAULT: "#9b2d3b",
          dark: "#7c2230",
          soft: "#c25a66",
        },
        sage: "#7c8a6f",
        espresso: { DEFAULT: "#2b211b", deep: "#1c1511" },
        champagne: { DEFAULT: "#c9a86a", soft: "#e2cfa6" },
        blush: "#ead9c9",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        card: "0 1px 2px rgba(31,26,22,0.04), 0 8px 30px rgba(31,26,22,0.06)",
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
