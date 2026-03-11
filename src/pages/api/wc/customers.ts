import type { APIRoute } from 'astro';

const REGION_CODES = ['DE', 'UK', 'FR'];

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
 * Query a single WooCommerce store for a customer by email.
 * Returns the first matching customer or null.
 */
async function wcLookup(region: string, email: string): Promise<any | null> {
  const store = WC_STORES[region];
  if (!store) return null;
  const auth = btoa(`${store.ck}:${store.cs}`);
  try {
    const resp = await fetch(
      `${store.url}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}&per_page=1`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/wc/customers?email=john@acme.com
 *   → Lookup customer across all 3 regions.
 *   → Tries D1 first, then falls back to live WC API for any missing regions,
 *     and caches results back into D1.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.toLowerCase().trim();

  if (!email) {
    return json({ error: 'email parameter required' }, 400);
  }

  const runtime = (locals as any).runtime;
  const db = runtime?.env?.CUSTOMERS_DB;

  // Step 1: Check D1 cache (if available)
  const d1Matches: Record<string, any> = {};
  if (db) {
    try {
      const results = await db
        .prepare('SELECT * FROM customers WHERE email = ? ORDER BY region ASC')
        .bind(email)
        .all();
      for (const row of results.results || []) {
        d1Matches[(row as any).region] = row;
      }
    } catch {
      // D1 not available or table missing — continue with live lookup
    }
  }

  // Step 2: For regions not in D1, query WooCommerce directly (in parallel)
  const missingRegions = REGION_CODES.filter((code) => !d1Matches[code]);
  const liveResults: Record<string, any> = {};

  if (missingRegions.length > 0) {
    const lookups = await Promise.all(
      missingRegions.map(async (code) => {
        const customer = await wcLookup(code, email);
        return { code, customer };
      })
    );

    for (const { code, customer } of lookups) {
      if (customer) {
        liveResults[code] = customer;

        // Cache into D1 for future lookups
        if (db) {
          try {
            await db
              .prepare(
                `INSERT OR REPLACE INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                code,
                customer.id,
                email,
                customer.first_name || '',
                customer.last_name || '',
                customer.billing?.company || '',
                customer.billing?.phone || '',
                new Date().toISOString()
              )
              .run();
          } catch {
            // Cache write failed — non-critical
          }
        }
      }
    }
  }

  // Step 3: Build response
  const regions: Record<string, any> = {};
  for (const code of REGION_CODES) {
    const d1 = d1Matches[code];
    const live = liveResults[code];

    if (d1) {
      regions[code] = {
        found: true,
        wc_customer_id: d1.wc_customer_id,
        first_name: d1.first_name,
        last_name: d1.last_name,
        company: d1.company,
        phone: d1.phone,
        synced_at: d1.synced_at,
      };
    } else if (live) {
      regions[code] = {
        found: true,
        wc_customer_id: live.id,
        first_name: live.first_name || '',
        last_name: live.last_name || '',
        company: live.billing?.company || '',
        phone: live.billing?.phone || '',
        synced_at: new Date().toISOString(),
      };
    } else {
      regions[code] = { found: false };
    }
  }

  return json({ email, regions });
};

/**
 * POST /api/wc/customers
 *   → Create a new customer on a specific region's WooCommerce site
 *   Body: { region, email, first_name, last_name, company? }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, email, first_name, last_name, company } = body;

  if (!region || !email) {
    return json({ error: 'region and email are required' }, 400);
  }

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Unknown region: ${region}` }, 400);
  }

  const auth = btoa(`${store.ck}:${store.cs}`);

  try {
    const resp = await fetch(`${store.url}/wp-json/wc/v3/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        first_name: first_name || '',
        last_name: last_name || '',
        billing: {
          email: email.toLowerCase().trim(),
          first_name: first_name || '',
          last_name: last_name || '',
          company: company || '',
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // If customer already exists, that's fine
      if (data.code === 'registration-error-email-exists') {
        return json({ success: true, already_exists: true, email });
      }
      return json({ error: data.message || `WC API error ${resp.status}` }, resp.status);
    }

    // Also save to D1 so the lookup works immediately
    const runtime = (locals as any).runtime;
    const db = runtime?.env?.CUSTOMERS_DB;
    if (db) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          region,
          data.id,
          email.toLowerCase().trim(),
          data.first_name || first_name || '',
          data.last_name || last_name || '',
          data.billing?.company || company || '',
          data.billing?.phone || '',
          new Date().toISOString()
        )
        .run();
    }

    return json({
      success: true,
      wc_customer_id: data.id,
      first_name: data.first_name,
      last_name: data.last_name,
      company: data.billing?.company || '',
      email: data.email,
      region,
    }, 201);
  } catch (err: any) {
    return json({ error: err.message || 'Network error' }, 500);
  }
};
