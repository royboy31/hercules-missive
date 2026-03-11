import type { APIRoute } from 'astro';

const PRODUCT_SYNC_WORKERS: Record<string, string> = {
  DE: 'https://hercules-product-sync.gilles-86d.workers.dev',
  UK: 'https://hercules-product-sync-uk.gilles-86d.workers.dev',
  FR: 'https://hercules-product-sync-fr-prod.gilles-86d.workers.dev',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/wc/products?region=FR&search=t-shirt
 *   → Fetches from KV-backed product-sync workers
 *   → If search param is provided, uses /search?q= endpoint
 *   → Otherwise returns all products from /products
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const region = (url.searchParams.get('region') || 'FR').toUpperCase();
  const search = url.searchParams.get('search') || '';

  const workerUrl = PRODUCT_SYNC_WORKERS[region];
  if (!workerUrl) {
    return json({ error: `Invalid region: ${region}` }, 400);
  }

  try {
    if (search) {
      // Search endpoint returns { success, data: [{ id, title, slug, thumbnail, categories }] }
      const res = await fetch(`${workerUrl}/search?q=${encodeURIComponent(search)}`);
      if (!res.ok) {
        return json({ error: `Product sync worker error: ${res.status}` }, res.status);
      }
      const data = await res.json() as any;
      const items = (data.data || []).map((p: any) => ({
        id: p.id,
        name: p.title,
        slug: p.slug,
        image: p.thumbnail || `${workerUrl}/image/${p.slug}`,
        categories: (p.categories || []).map((c: string) => ({ name: c })),
      }));
      return json({ region, items, total: items.length });
    } else {
      // Products endpoint returns array of { id, name, slug, categories (slugs), menu_order }
      const res = await fetch(`${workerUrl}/products`);
      if (!res.ok) {
        return json({ error: `Product sync worker error: ${res.status}` }, res.status);
      }
      const products = await res.json() as any[];
      const items = products.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: `${workerUrl}/image/${p.slug}`,
        categories: (p.categories || []).map((c: string) => ({ name: c })),
      }));
      return json({ region, items, total: items.length });
    }
  } catch (err: any) {
    return json({ error: err.message || 'Failed to fetch products' }, 500);
  }
};
