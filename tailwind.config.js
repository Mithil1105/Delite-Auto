/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1160px", "2xl": "1280px" },
    },
    extend: {
      colors: {
        ink: "#14181b",
        paper: "#f7f8f8",
        line: "#e3e7e8",
        charcoal: {
          DEFAULT: "#181d21",
          soft: "#1f262b",
          deep: "#0f1214",
        },
        steel: {
          50: "#eef2f4",
          100: "#dbe3e7",
          300: "#9db0b9",
          500: "#56707c",
          700: "#334750",
          900: "#1c2830",
        },
        accent: {
          DEFAULT: "#e1571f",
          600: "#c8481a",
          700: "#a83b15",
          100: "#fbe2d3",
          50: "#fdf1e9",
        },
        badge: {
          new: "#1f8f6b",
          sale: "#c8481a",
        },
      },
      fontFamily: {
        display: ["Oswald", "Hind", "Hind Vadodara", "ui-sans-serif", "sans-serif"],
        sans: ["IBM Plex Sans", "Hind", "Hind Vadodara", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Hind", "Hind Vadodara", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,24,27,0.04), 0 10px 24px -14px rgba(20,24,27,0.22)",
        lift: "0 18px 40px -18px rgba(20,24,27,0.35)",
      },
      backgroundImage: {
        "diagonal-lines":
          "repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 14px)",
        "grain-dark":
          "radial-gradient(circle at 15% 20%, rgba(225,87,31,0.16), transparent 45%), radial-gradient(circle at 85% 80%, rgba(86,112,124,0.25), transparent 50%)",
      },
      letterSpacing: {
        tightish: "-0.01em",
        widish: "0.06em",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        fadeUp: "fadeUp 0.6s ease both",
      },
    },
  },
  plugins: [],
};
