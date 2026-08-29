import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0f2340",
          dark: "#0a1830",
        },
        accent: {
          DEFAULT: "#0f9d9d",
          light: "#e6f5f5",
        },
        surface: "#f6f7f9",
        card: "#ffffff",
        ink: "#1c1f26",
        muted: "#6b7280",
        danger: "#dc2626",
        success: "#16a34a",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
