import type { APIRoute } from 'astro';
import { getWcStores } from '../../../lib/wc-stores';

const REGION_CODES = ['DE', 'UK', 'FR'];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract a meta value from WC customer meta_data array */
function getCustomerMeta(customer: any, key: string): string {
  if (!customer?.meta_data || !Array.isArray(customer.meta_data)) return '';
  const entry = customer.meta_data.find((m: any) => m.key === key);
  return entry?.value || '';
}

/** Resolve customer_type from WC API response, D1 cache, or heuristic (in priority order) */
function resolveCustomerType(wcCustomer: any | null, d1Row: any | null, company: string, vatNum: string): string {
  // 1. WC REST field (registered by hercules-customer-type-meta.php)
  if (wcCustomer?.customer_type && wcCustomer.customer_type !== '') {
    return wcCustomer.customer_type;
  }
  // 2. WC meta_data
  if (wcCustomer) {
    const meta = getCustomerMeta(wcCustomer, 'customer_type');
    if (meta) return meta;
  }
  // 3. D1 stored value (if not legacy 'organization')
  if (d1Row?.customer_type && d1Row.customer_type !== 'organization') {
    return d1Row.customer_type;
  }
  // 4. Heuristic: has company/VAT → company, else individual
  if (company || vatNum) return 'company';
  return 'individual';
}

/**
 * Query a single WooCommerce store for a customer by email.
 * Returns the first matching customer or null.
 */
async function wcLookup(region: string, email: string, WC_STORES: Record<string, { url: string; ck: string; cs: string }>): Promise<any | null> {
  const store = WC_STORES[region];
  if (!store) return null;
  const auth = btoa(`${store.ck}:${store.cs}`);
  try {
    const resp = await fetch(
      `${store.url}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}&per_page=1&role=all`,
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
  const search = url.searchParams.get('search')?.trim();

  const runtime = (locals as any).runtime;
  const db = runtime?.env?.CUSTOMERS_DB;
  const WC_STORES = getWcStores(runtime?.env || {});

  // ── Search mode: query D1 by name/email/company ──
  if (search) {
    if (search.length < 2) {
      return json({ error: 'search term must be at least 2 characters' }, 400);
    }
    if (!db) {
      return json({ error: 'Database not available' }, 500);
    }
    try {
      const term = `%${search.toLowerCase()}%`;
      const results = await db
        .prepare(
          `SELECT email, first_name, last_name, company, region
           FROM customers
           WHERE LOWER(email) LIKE ? OR LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(company) LIKE ?
           ORDER BY synced_at DESC
           LIMIT 10`
        )
        .bind(term, term, term, term)
        .all();

      return json({
        results: (results.results || []).map((r: any) => ({
          email: r.email,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          company: r.company || '',
          region: r.region,
        })),
      });
    } catch (err: any) {
      return json({ error: err.message || 'Search failed' }, 500);
    }
  }

  // ── Email lookup mode ──
  if (!email) {
    return json({ error: 'email or search parameter required' }, 400);
  }

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
        const customer = await wcLookup(code, email, WC_STORES);
        return { code, customer };
      })
    );

    for (const { code, customer } of lookups) {
      if (customer) {
        liveResults[code] = customer;

        // Cache into D1 for future lookups
        if (db) {
          try {
            const vatNum = getCustomerMeta(customer, 'billing_vat_number');
            const ctResolved = resolveCustomerType(customer, null, customer.billing?.company || '', vatNum);
            await db
              .prepare(
                `INSERT OR REPLACE INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, vat_number, customer_type, country, address_1, address_2, city, postcode, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                code,
                customer.id,
                email,
                customer.first_name || '',
                customer.last_name || '',
                customer.billing?.company || '',
                customer.billing?.phone || '',
                vatNum,
                ctResolved,
                customer.billing?.country || '',
                customer.billing?.address_1 || '',
                customer.billing?.address_2 || '',
                customer.billing?.city || '',
                customer.billing?.postcode || '',
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

  // Step 3: For D1 hits, fetch orders_count/total_spent from WC in parallel
  const d1Enrichments: Record<string, any> = {};
  const d1RegionsToEnrich = REGION_CODES.filter((code) => d1Matches[code]);
  if (d1RegionsToEnrich.length > 0) {
    const enrichResults = await Promise.all(
      d1RegionsToEnrich.map(async (code) => {
        const customer = await wcLookup(code, email, WC_STORES);
        return { code, customer };
      })
    );
    for (const { code, customer } of enrichResults) {
      if (customer) {
        d1Enrichments[code] = customer;
        // Update D1 cache with fresh data (preserve notes)
        if (db) {
          try {
            const vatNum = getCustomerMeta(customer, 'billing_vat_number');
            const ctResolved = resolveCustomerType(customer, d1Matches[code], customer.billing?.company || '', vatNum);
            // Preserve existing notes from D1
            const existingNotes = d1Matches[code]?.notes || '';
            await db
              .prepare(
                `INSERT OR REPLACE INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, vat_number, customer_type, country, address_1, address_2, city, postcode, notes, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                code,
                customer.id,
                email,
                customer.first_name || '',
                customer.last_name || '',
                customer.billing?.company || '',
                customer.billing?.phone || '',
                vatNum,
                ctResolved,
                customer.billing?.country || '',
                customer.billing?.address_1 || '',
                customer.billing?.address_2 || '',
                customer.billing?.city || '',
                customer.billing?.postcode || '',
                existingNotes,
                new Date().toISOString()
              )
              .run();
          } catch { /* non-critical */ }
        }
      } else {
        // Customer was deleted from WC — remove stale D1 cache entry
        delete d1Matches[code];
        if (db) {
          try {
            await db
              .prepare('DELETE FROM customers WHERE email = ? AND region = ?')
              .bind(email, code)
              .run();
          } catch { /* non-critical */ }
        }
      }
    }
  }

  // Step 4: Build response
  const regions: Record<string, any> = {};
  for (const code of REGION_CODES) {
    const d1 = d1Matches[code];
    const live = liveResults[code];
    const enriched = d1Enrichments[code];

    if (d1) {
      const vatNum = enriched ? getCustomerMeta(enriched, 'billing_vat_number') : (d1.vat_number || '');
      const company = enriched?.billing?.company || d1.company || '';
      const ctResolved = resolveCustomerType(enriched, d1, company, vatNum);
      regions[code] = {
        found: true,
        wc_customer_id: d1.wc_customer_id,
        first_name: enriched?.first_name || d1.first_name,
        last_name: enriched?.last_name || d1.last_name,
        company,
        phone: enriched?.billing?.phone || d1.phone,
        vat_number: vatNum,
        customer_type: ctResolved,
        country: enriched?.billing?.country || d1.country || '',
        address_1: enriched?.billing?.address_1 || d1.address_1 || '',
        address_2: enriched?.billing?.address_2 || d1.address_2 || '',
        city: enriched?.billing?.city || d1.city || '',
        postcode: enriched?.billing?.postcode || d1.postcode || '',
        notes: d1.notes || '',
        distributor_discount: parseFloat(enriched?.distributor_discount) || 0,
        orders_count: enriched?.orders_count || 0,
        total_spent: enriched?.total_spent || '0.00',
        synced_at: d1.synced_at,
      };
    } else if (live) {
      const vatNum = getCustomerMeta(live, 'billing_vat_number');
      const company = live.billing?.company || '';
      const ctResolved = resolveCustomerType(live, null, company, vatNum);
      regions[code] = {
        found: true,
        wc_customer_id: live.id,
        first_name: live.first_name || '',
        last_name: live.last_name || '',
        company,
        phone: live.billing?.phone || '',
        vat_number: vatNum,
        customer_type: ctResolved,
        country: live.billing?.country || '',
        address_1: live.billing?.address_1 || '',
        address_2: live.billing?.address_2 || '',
        city: live.billing?.city || '',
        postcode: live.billing?.postcode || '',
        notes: '',
        distributor_discount: parseFloat(live.distributor_discount) || 0,
        orders_count: live.orders_count || 0,
        total_spent: live.total_spent || '0.00',
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
 *   Body: { region, email, first_name, last_name, company?, address_1?, address_2?, city?, postcode?, country? }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const WC_STORES = getWcStores(runtime?.env || {});
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, email, first_name, last_name, company, country, address_1, address_2, city, postcode } = body;

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
          country: country || '',
          address_1: address_1 || '',
          address_2: address_2 || '',
          city: city || '',
          postcode: postcode || '',
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
          `INSERT OR REPLACE INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, vat_number, customer_type, country, address_1, address_2, city, postcode, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          region,
          data.id,
          email.toLowerCase().trim(),
          data.first_name || first_name || '',
          data.last_name || last_name || '',
          data.billing?.company || company || '',
          data.billing?.phone || '',
          '',
          resolveCustomerType(data, null, company || '', ''),
          data.billing?.country || country || '',
          data.billing?.address_1 || address_1 || '',
          data.billing?.address_2 || address_2 || '',
          data.billing?.city || city || '',
          data.billing?.postcode || postcode || '',
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

/**
 * PUT /api/wc/customers
 *   → Update an existing customer on a specific region's WooCommerce site
 *   Body: { region, wc_customer_id, first_name?, last_name?, company?, phone?, vat_number?, address_1?, address_2?, city?, postcode?, country?, notes? }
 *   notes is stored only in D1 (CRM-internal), not sent to WooCommerce
 */
export const PUT: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const WC_STORES = getWcStores(runtime?.env || {});
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, wc_customer_id, first_name, last_name, company, phone, vat_number, customer_type, country, address_1, address_2, city, postcode, notes } = body;

  if (!region || !wc_customer_id) {
    return json({ error: 'region and wc_customer_id are required' }, 400);
  }

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Unknown region: ${region}` }, 400);
  }

  const auth = btoa(`${store.ck}:${store.cs}`);

  // Build WC update payload
  const updatePayload: any = {};
  if (first_name !== undefined) updatePayload.first_name = first_name;
  if (last_name !== undefined) updatePayload.last_name = last_name;

  const billingUpdate: any = {};
  if (company !== undefined) billingUpdate.company = company;
  if (phone !== undefined) billingUpdate.phone = phone;
  if (country !== undefined) billingUpdate.country = country;
  if (address_1 !== undefined) billingUpdate.address_1 = address_1;
  if (address_2 !== undefined) billingUpdate.address_2 = address_2;
  if (city !== undefined) billingUpdate.city = city;
  if (postcode !== undefined) billingUpdate.postcode = postcode;
  if (Object.keys(billingUpdate).length > 0) updatePayload.billing = billingUpdate;

  // VAT number and customer_type go into WC meta_data
  const metaUpdates: { key: string; value: string }[] = [];
  if (vat_number !== undefined) metaUpdates.push({ key: 'billing_vat_number', value: vat_number });
  if (customer_type !== undefined) metaUpdates.push({ key: 'customer_type', value: customer_type });
  if (metaUpdates.length > 0) updatePayload.meta_data = metaUpdates;

  try {
    const resp = await fetch(`${store.url}/wp-json/wc/v3/customers/${wc_customer_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(updatePayload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return json({ error: data.message || `WC API error ${resp.status}` }, resp.status);
    }

    const updatedVat = getCustomerMeta(data, 'billing_vat_number');
    const updatedCompany = data.billing?.company || '';
    const ctResolved = resolveCustomerType(data, null, updatedCompany, updatedVat);

    // Update D1 cache (including notes which is D1-only)
    const runtime = (locals as any).runtime;
    const db = runtime?.env?.CUSTOMERS_DB;
    if (db) {
      try {
        const setClauses = [
          'first_name = ?', 'last_name = ?', 'company = ?', 'phone = ?',
          'vat_number = ?', 'customer_type = ?', 'country = ?',
          'address_1 = ?', 'address_2 = ?', 'city = ?', 'postcode = ?', 'synced_at = ?',
        ];
        const bindValues: any[] = [
          data.first_name || '', data.last_name || '',
          updatedCompany, data.billing?.phone || '',
          updatedVat, ctResolved,
          data.billing?.country || '',
          data.billing?.address_1 || '',
          data.billing?.address_2 || '',
          data.billing?.city || '',
          data.billing?.postcode || '',
          new Date().toISOString(),
        ];

        if (notes !== undefined) {
          setClauses.push('notes = ?');
          bindValues.push(notes);
        }

        bindValues.push(region, wc_customer_id);

        await db
          .prepare(
            `UPDATE customers SET ${setClauses.join(', ')} WHERE region = ? AND wc_customer_id = ?`
          )
          .bind(...bindValues)
          .run();
      } catch { /* non-critical */ }
    }

    return json({
      success: true,
      wc_customer_id: data.id,
      first_name: data.first_name,
      last_name: data.last_name,
      company: updatedCompany,
      phone: data.billing?.phone || '',
      vat_number: updatedVat,
      customer_type: ctResolved,
      country: data.billing?.country || '',
      address_1: data.billing?.address_1 || '',
      address_2: data.billing?.address_2 || '',
      city: data.billing?.city || '',
      postcode: data.billing?.postcode || '',
      notes: notes !== undefined ? notes : '',
      email: data.email,
      region,
    });
  } catch (err: any) {
    return json({ error: err.message || 'Network error' }, 500);
  }
};
