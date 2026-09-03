import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // ponytail: dedupe core peers only — Vite auto-discovers rest.
  resolve: {
    dedupe: ['codemirror', '@codemirror/state', '@codemirror/view'],
  },
})
