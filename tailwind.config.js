/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#f3ead7",
        ink: "#1f2937",
        ember: "#b45309",
        olive: "#4d7c0f"
      }
    }
  },
  plugins: []
};
