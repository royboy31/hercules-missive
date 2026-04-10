import type { APIRoute } from 'astro';

/**
 * GET /api/wc/design-file/designs/2026/03/15/...
 * Serves files from R2 bucket
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = (locals as any).runtime;
  const bucket = runtime?.env?.DESIGN_UPLOADS;

  if (!bucket) {
    return new Response('File storage not configured', { status: 503 });
  }

  const key = params.key;
  if (!key) {
    return new Response('File not found', { status: 404 });
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('File not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');
    const originalName = object.customMetadata?.originalName || key.split('/').pop() || 'file';
    headers.set('Content-Disposition', `inline; filename="${originalName}"`);

    return new Response(object.body, { headers });
  } catch {
    return new Response('Error serving file', { status: 500 });
  }
};
