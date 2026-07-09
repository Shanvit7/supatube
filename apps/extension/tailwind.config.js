/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.{tsx,ts}"],
  theme: {
    extend: {
      colors: {
        brand: "#ef4444", // YouTube red, re-used as accent
      },
    },
  },
  plugins: [],
}
