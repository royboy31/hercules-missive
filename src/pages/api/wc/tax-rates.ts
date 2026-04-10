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
 * GET /api/wc/tax-rates?region=DE&country=AT
 *   → Fetch the WooCommerce tax rate for a given billing country.
 *
 * GET /api/wc/tax-rates?region=DE
 *   → (no country param) Fetch all countries with configured tax rates for this region.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const region = url.searchParams.get('region')?.toUpperCase();
  const country = url.searchParams.get('country')?.toUpperCase();

  if (!region) {
    return json({ error: 'region parameter required' }, 400);
  }

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Unknown region: ${region}` }, 400);
  }

  // If country is provided, fetch single tax rate
  if (country) {
    try {
      const resp = await fetch(
        `${store.url}/wp-json/hercules/v1/tax-rate?country=${encodeURIComponent(country)}`,
      );

      if (!resp.ok) {
        return json({ error: `WP API error ${resp.status}` }, resp.status);
      }

      const data = await resp.json();
      return json({
        country: data.country || country,
        rate: data.rate ?? 0,
        region,
      });
    } catch (err: any) {
      return json({ error: err.message || 'Network error' }, 500);
    }
  }

  // No country — fetch all configured tax countries for this region
  try {
    const resp = await fetch(
      `${store.url}/wp-json/hercules/v1/tax-countries`,
    );

    if (!resp.ok) {
      return json({ error: `WP API error ${resp.status}` }, resp.status);
    }

    const data = await resp.json();
    return json({
      region,
      countries: data.countries || [],
    });
  } catch (err: any) {
    return json({ error: err.message || 'Network error' }, 500);
  }
};
