import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060a12",
          900: "#0a0e17",
          800: "#0f1623",
          700: "#151d2e",
        },
        steel: {
          400: "#9aa8b8",
          500: "#7d8b9a",
          600: "#5c6b7a",
          border: "#2a3544",
          muted: "#3d4d5f",
        },
        accent: {
          positive: "#3d9a6f",
          negative: "#c45c5c",
          highlight: "#c8d0dc",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "inset 0 1px 0 0 rgba(200, 208, 220, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
