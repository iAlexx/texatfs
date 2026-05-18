import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          positive: "#3d9a6f",
          negative: "#c45c5c",
          highlight: "#c8d0dc",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        gold: {
          DEFAULT: "#c9a227",
          muted: "#8a7020",
          foreground: "#0a0a0b",
        },
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "inset 0 1px 0 0 rgba(200, 208, 220, 0.06)",
        luxury: "0 0 0 1px rgba(201, 162, 39, 0.12), 0 8px 32px rgba(0,0,0,0.45)",
      },
      backgroundImage: {
        "steel-gradient":
          "linear-gradient(145deg, rgba(42,53,68,0.9) 0%, rgba(15,22,35,0.95) 100%)",
        "gold-gradient":
          "linear-gradient(135deg, #d4af37 0%, #c9a227 50%, #8a7020 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
