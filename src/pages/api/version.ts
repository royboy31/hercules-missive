import type { APIRoute } from 'astro';

/**
 * GET /api/version → { buildId, buildTime }
 *
 * Both values are baked in by vite `define` (astro.config.mjs), so this route always
 * reports the build that is currently deployed. The sidebar carries the same values in
 * its own bundle and compares them: a mismatch means the panel is running superseded
 * code and needs to reload. Never cached — a cached answer would defeat the whole point.
 */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      buildId: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
      buildTime: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
