/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#0b1210",
          900: "#0f1a16",
          800: "#152420",
          700: "#1e322b",
        },
      },
    },
  },
  plugins: [],
};
