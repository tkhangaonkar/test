import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset paths relative so the build also works inside
// Capacitor (Android) and when opened from a sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
});
