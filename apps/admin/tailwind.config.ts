import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TRS official brand palette (matches apps/app/src/theme.ts)
        navy: "#1A3580",
        navydark: "#0F1F4E",
        saffron: "#E8A820", // legacy name — value is TRS gold
        trsgreen: "#2B5216",
      },
    },
  },
  plugins: [],
} satisfies Config;
