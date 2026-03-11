import type { APIRoute } from 'astro';

const WC_STORES: Record<string, { url: string; ck: string; cs: string }> = {
  DE: {
    url: 'https://hercules-merchandise.de',
    ck: 'ck_25a394425268abad8f7255eaff2349e10bc1e3d5',
    cs: 'cs_aee9e05ff27a008297c5bdded53e766efbbef068',
  },
  UK: {
    url: 'https://hercules-merchandise.co.uk',
    ck: 'ck_5d7dfb3d454cd2a0cbd8dae317caa09eb0084f9f',
    cs: 'cs_5257e559b5a555d9e5fe9e4983616583c55cb278',
  },
  FR: {
    url: 'https://hercules-merchandising.fr',
    ck: 'ck_b2fb9151600c581d945db314fc83219877e10118',
    cs: 'cs_38014792bf0129ddbac1f414ef5c9072c8ba4aca',
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/wc/categories?region=DE
 */
export const GET: APIRoute = async ({ request }) => {
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
