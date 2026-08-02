import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f4f1ea",
        paper: "#e9e4da",
        panel: "#f8f6f1",
        ink: "#171714",
        muted: "#67635d",
        line: "#d2cdc3",
        ember: { DEFAULT: "#762d38", soft: "#d8b7bb", deep: "#5c202a" },
        claret: { DEFAULT: "#762d38", dark: "#5c202a", soft: "#d8b7bb" },
        sage: "#5f6c4b",
        espresso: { DEFAULT: "#24211d", deep: "#171714" },
        champagne: { DEFAULT: "#c5a675", soft: "#e4d7bd" },
        blush: "#eadbdb",
        // The operator console runs its own greyscale, defined once as CSS
        // variables on .studio-shell in globals.css. Exposing them as Tailwind
        // colours means components write `border-studio-line` instead of
        // `border-[#e3e3e6]`, which was pasted around 80 times and drifted
        // from the variables it was meant to match.
        // Fallbacks matter: the variables are scoped to .studio-shell, and a
        // studio component rendered outside it (a loading state, an error
        // boundary) would otherwise resolve to an invalid colour.
        studio: {
          ink: "var(--studio-ink, #16161a)",
          muted: "var(--studio-muted, #6b6b73)",
          line: "var(--studio-line, #e3e3e6)",
          panel: "var(--studio-panel, #ffffff)",
          canvas: "var(--studio-canvas, #f5f5f6)",
          subtle: "var(--studio-subtle, #fafafa)",
          active: "var(--studio-active, #f0f0f1)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl2: "0.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(23, 23, 20, 0.05)",
        glow: "0 0 0 1px rgba(118, 45, 56, 0.12)",
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
