import type { APIRoute } from 'astro';

const WC_STORES: Record<string, { url: string }> = {
  DE: { url: 'https://hercules-merchandise.de' },
  UK: { url: 'https://hercules-merchandise.co.uk' },
  FR: { url: 'https://hercules-merchandising.fr' },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/wc/product-config?region=DE&id=4332
 *   → Fetches full product configuration (attributes, variations, addons, conditional prices)
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const region = (url.searchParams.get('region') || 'DE').toUpperCase();
  const productId = url.searchParams.get('id');

  if (!productId) {
    return json({ error: 'id parameter required' }, 400);
  }

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Invalid region: ${region}` }, 400);
  }

  const configUrl = `${store.url}/wp-json/hercules/v1/product-config/${productId}`;

  const res = await fetch(configUrl);

  if (!res.ok) {
    const text = await res.text();
    return json({ error: `Product config fetch failed: ${res.status}`, detail: text }, res.status);
  }

  const config = await res.json();
  return json(config);
};
