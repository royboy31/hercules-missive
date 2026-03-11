/**
 * Hercules Customer Sync Worker
 *
 * Receives WooCommerce webhooks for customer.created / customer.updated
 * and upserts customer data into Cloudflare D1.
 *
 * Also provides a bulk-import endpoint to seed the database from all 3 stores.
 *
 * Endpoints:
 *   POST /webhook?region=DE|UK|FR  — WooCommerce webhook receiver
 *   POST /bulk-import?region=DE|UK|FR — Bulk import from WC REST API
 *   GET  /status — Health check
 */

interface Env {
  CUSTOMERS_DB: D1Database;
  WEBHOOK_SECRET: string;

  // WooCommerce API keys per region (set via wrangler secret)
  WC_DE_CONSUMER_KEY: string;
  WC_DE_CONSUMER_SECRET: string;
  WC_UK_CONSUMER_KEY: string;
  WC_UK_CONSUMER_SECRET: string;
  WC_FR_CONSUMER_KEY: string;
  WC_FR_CONSUMER_SECRET: string;
}

const REGIONS: Record<string, string> = {
  DE: 'https://hercules-merchandise.de',
  UK: 'https://hercules-merchandise.co.uk',
  FR: 'https://hercules-merchandising.fr',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WC-Webhook-Signature, X-WC-Webhook-Topic',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/** Verify WooCommerce webhook HMAC-SHA256 signature */
async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));
  return expected === signature;
}

/** Extract customer fields from WooCommerce customer payload */
function extractCustomer(data: any) {
  return {
    wc_customer_id: data.id,
    email: (data.email || '').toLowerCase().trim(),
    first_name: data.first_name || data.billing?.first_name || '',
    last_name: data.last_name || data.billing?.last_name || '',
    company: data.billing?.company || '',
    phone: data.billing?.phone || '',
  };
}

/** Upsert a single customer into D1 */
async function upsertCustomer(db: D1Database, region: string, customer: ReturnType<typeof extractCustomer>) {
  if (!customer.email || !customer.wc_customer_id) return;

  await db
    .prepare(
      `INSERT INTO customers (region, wc_customer_id, email, first_name, last_name, company, phone, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (region, wc_customer_id)
       DO UPDATE SET email = excluded.email,
                     first_name = excluded.first_name,
                     last_name = excluded.last_name,
                     company = excluded.company,
                     phone = excluded.phone,
                     synced_at = excluded.synced_at`
    )
    .bind(
      region,
      customer.wc_customer_id,
      customer.email,
      customer.first_name,
      customer.last_name,
      customer.company,
      customer.phone,
      new Date().toISOString()
    )
    .run();
}

/** Delete a customer from D1 */
async function deleteCustomer(db: D1Database, region: string, wcCustomerId: number) {
  if (!wcCustomerId) return;
  await db
    .prepare('DELETE FROM customers WHERE region = ? AND wc_customer_id = ?')
    .bind(region, wcCustomerId)
    .run();
}

/** Get WC API credentials for a region */
function getWcCredentials(env: Env, region: string) {
  const map: Record<string, { key: string; secret: string }> = {
    DE: { key: env.WC_DE_CONSUMER_KEY, secret: env.WC_DE_CONSUMER_SECRET },
    UK: { key: env.WC_UK_CONSUMER_KEY, secret: env.WC_UK_CONSUMER_SECRET },
    FR: { key: env.WC_FR_CONSUMER_KEY, secret: env.WC_FR_CONSUMER_SECRET },
  };
  return map[region];
}

/** Handle incoming WooCommerce webhook */
async function handleWebhook(request: Request, env: Env, region: string): Promise<Response> {
  const body = await request.text();

  // Verify signature
  const signature = request.headers.get('X-WC-Webhook-Signature') || '';
  if (!signature) {
    return jsonResponse({ error: 'Missing webhook signature' }, 401);
  }

  const valid = await verifyWebhookSignature(body, signature, env.WEBHOOK_SECRET);
  if (!valid) {
    return jsonResponse({ error: 'Invalid webhook signature' }, 401);
  }

  const data = JSON.parse(body);

  // WooCommerce sends a ping on webhook creation — just acknowledge it
  const topic = request.headers.get('X-WC-Webhook-Topic') || '';
  if (topic === 'action.woocommerce_webhook_ping' || !data.id) {
    return jsonResponse({ ok: true, message: 'Ping acknowledged' });
  }

  // Handle customer deletion
  if (topic === 'customer.deleted') {
    await deleteCustomer(env.CUSTOMERS_DB, region, data.id);
    return jsonResponse({
      ok: true,
      action: 'deleted',
      region,
      customer_id: data.id,
    });
  }

  // Handle customer created/updated
  const customer = extractCustomer(data);
  await upsertCustomer(env.CUSTOMERS_DB, region, customer);

  return jsonResponse({
    ok: true,
    action: topic === 'customer.created' ? 'created' : 'updated',
    region,
    customer_id: customer.wc_customer_id,
    email: customer.email,
  });
}

/** Bulk import all customers from a WooCommerce store */
async function handleBulkImport(request: Request, env: Env, region: string): Promise<Response> {
  // Simple auth check
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader !== `Bearer ${env.WEBHOOK_SECRET}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const storeUrl = REGIONS[region];
  const creds = getWcCredentials(env, region);
  if (!creds || !creds.key) {
    return jsonResponse({ error: `No WC credentials configured for ${region}` }, 400);
  }

  const auth = btoa(`${creds.key}:${creds.secret}`);
  let page = 1;
  let total = 0;
  const perPage = 100;

  while (true) {
    const url = `${storeUrl}/wp-json/wc/v3/customers?per_page=${perPage}&page=${page}&orderby=id&order=asc`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      return jsonResponse({
        error: `WC API error: ${res.status}`,
        page,
        total_imported: total,
      }, 502);
    }

    const customers: any[] = await res.json();
    if (customers.length === 0) break;

    // Batch upsert
    for (const c of customers) {
      const customer = extractCustomer(c);
      if (customer.email) {
        await upsertCustomer(env.CUSTOMERS_DB, region, customer);
        total++;
      }
    }

    // If we got fewer than perPage, we've reached the end
    if (customers.length < perPage) break;
    page++;
  }

  return jsonResponse({ ok: true, region, total_imported: total, pages: page });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const region = (url.searchParams.get('region') || '').toUpperCase();

    // Health check
    if (path === '/status' || path === '/') {
      const count = await env.CUSTOMERS_DB.prepare('SELECT COUNT(*) as count FROM customers').first<{ count: number }>();
      return jsonResponse({
        ok: true,
        service: 'hercules-customer-sync',
        total_customers: count?.count || 0,
      });
    }

    // Validate region for webhook and bulk-import
    if (path === '/webhook' || path === '/bulk-import') {
      if (!REGIONS[region]) {
        return jsonResponse({ error: `Invalid region: ${region}. Use DE, UK, or FR.` }, 400);
      }

      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }

      if (path === '/webhook') {
        return handleWebhook(request, env, region);
      }

      if (path === '/bulk-import') {
        return handleBulkImport(request, env, region);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
