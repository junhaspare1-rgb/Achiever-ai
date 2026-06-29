/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        sk: {
          red: "#EA002C",
          orange: "#F47725",
          black: "#0F0F0F",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "sk-glow": "0 0 48px rgba(244, 119, 37, 0.24)",
        "sk-red": "0 18px 48px rgba(234, 0, 44, 0.32)",
      },
    },
  },
  plugins: [],
};
