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
    },
  },
  plugins: [],
} satisfies Config;
