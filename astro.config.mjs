// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()],
    // Build identity, stamped into the client bundle AND /api/version from the same build.
    // The panel compares the two to notice it is running a superseded deploy — Missive keeps
    // an integration iframe alive for the whole app session, so a panel opened before a deploy
    // would otherwise keep running the old code indefinitely.
    define: {
      __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA || '').slice(0, 7) || 'dev'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  },

  integrations: [react()],
});
