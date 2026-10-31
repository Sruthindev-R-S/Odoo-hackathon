import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      '/user': 'http://localhost:3000',
      '/company-users': 'http://localhost:3000',
      '/products': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
})
