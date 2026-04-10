import type { APIRoute } from 'astro';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateR2Key(originalName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = now.getTime();
  const randomId = Math.random().toString(36).substring(2, 8);
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/__+/g, '_');
  return `designs/${year}/${month}/${day}/${timestamp}-${randomId}-${sanitizedName}`;
}

/**
 * POST /api/wc/upload-design
 * Body JSON: { files: [{ name, type, data (base64) }] }
 * Returns: { success, files: [{ name, url }] }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const bucket = runtime?.env?.DESIGN_UPLOADS;

  if (!bucket) {
    return json({ error: 'File storage not configured' }, 500);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return json({ error: 'No files provided' }, 400);
  }

  if (files.length > 10) {
    return json({ error: 'Maximum 10 files allowed' }, 400);
  }

  const uploaded: { name: string; url: string }[] = [];

  try {
    for (const file of files) {
      if (!file.name || !file.data) continue;

      const key = generateR2Key(file.name);
      const binaryString = atob(file.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      await bucket.put(key, bytes, {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream',
        },
        customMetadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      });

      uploaded.push({
        name: file.name,
        url: `/api/wc/design-file/${key}`,
      });
    }

    return json({ success: true, files: uploaded });
  } catch (err: any) {
    return json({ error: err.message || 'Upload failed' }, 500);
  }
};
