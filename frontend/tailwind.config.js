/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx}", "./src/components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101114",
        paper: "#FAFAFA",
        panel: "#FFFFFF",
        line: "#E7E7E7",
        accent: "#16A34A",
        accentDark: "#15803D",
        accentBg: "#EAF7EF",
        signal: {
          sent: "#16A34A",
          sentBg: "#EAF7EF",
          scheduled: "#B4740E",
          scheduledBg: "#FBF0DC",
          failed: "#C4341E",
          failedBg: "#FBE9E6",
        },
        muted: "#6B7080",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
