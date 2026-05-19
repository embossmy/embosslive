import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FBF8F3",
        champagne: "#E8DDC9",
        sand: "#D9CDB6",
        ink: "#1A1A1A",
        mocha: "#6B5B4A",
        gold: "#B8935A",
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "Georgia", "serif"],
        sans: ["Sora", "system-ui", "sans-serif"],
        script: ["'Great Vibes'", "cursive"],
        modern: ["Sora", "system-ui", "sans-serif"],
        classic: ["'Playfair Display'", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 4px 20px rgba(0,0,0,0.06)",
        card: "0 8px 40px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
