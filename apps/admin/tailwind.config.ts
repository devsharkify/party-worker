import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0b1f3a",
        saffron: "#ff9933",
      },
    },
  },
  plugins: [],
} satisfies Config;
