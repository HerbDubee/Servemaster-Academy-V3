/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './app.html',
    './admin.html',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          coral: '#FF5E3A',
          'coral-hover': '#e8522e',
          amber: '#fbbf24',
          teal: '#0A4D68',
        },
      },
    },
  },
  plugins: [],
}
