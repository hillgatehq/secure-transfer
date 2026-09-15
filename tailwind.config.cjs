/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./src/**/*.tsx", "./public/*.html"],
  theme: {
    extend: {
      colors: {
        paper: "#E9EBE6", // banknote stock
        inset: "#F3F4F0", // recessed plate
        ink: "#17201C", // engraving black-green
        muted: "#5C6660",
        rule: "#B9C0B6",
        intaglio: "#1F5D4C", // receiving
        seal: "#7A2E3B", // sending
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "sans-serif"],
        display: ["Spectral", "Georgia", "Cambria", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
};
