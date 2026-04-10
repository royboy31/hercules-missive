import type { APIRoute } from 'astro';
import { getWcStores } from '../../../lib/wc-stores';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/wc/categories?region=DE
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const WC_STORES = getWcStores(runtime?.env || {});
  const url = new URL(request.url);
  const region = (url.searchParams.get('region') || 'DE').toUpperCase();

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Invalid region: ${region}` }, 400);
  }

  const wcUrl = `${store.url}/wp-json/wc/v3/products/categories?per_page=100&orderby=name&order=asc`;
  const auth = btoa(`${store.ck}:${store.cs}`);

  const res = await fetch(wcUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    return json({ error: `WooCommerce API error: ${res.status}` }, res.status);
  }

  const categories = await res.json();

  const items = (categories as any[])
    .filter((c) => c.count > 0)
    .map((c) => ({ id: c.id, name: c.name, count: c.count, parent: c.parent }))
    .sort((a, b) => b.count - a.count);

  return json({ region, categories: items });
};
