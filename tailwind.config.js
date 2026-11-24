/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1110",
        panel: "#111a18",
        line: "#24312d",
        mint: "#55e6a5"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"]
      },
      boxShadow: {
        glow: "0 0 48px rgba(85, 230, 165, .11)"
      }
    }
  },
  plugins: []
};
