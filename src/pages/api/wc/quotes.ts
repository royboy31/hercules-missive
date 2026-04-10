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

const CRM_QUOTE_SECRET = 'hercules-crm-quote-secret-2026';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fallback tax rates — only used if frontend doesn't supply a rate
const FALLBACK_TAX: Record<string, number> = { DE: 19, UK: 20, FR: 20 };

/**
 * Create a quote_request on any region via the mu-plugin REST endpoint
 */
async function createQuoteRequest(
  region: string,
  lineItems: any[],
  customerEmail: string,
  customerName?: string,
  company?: string,
  notes?: string,
  totalNet?: number,
  totalGross?: number,
  taxPercent?: number,
  quoteName?: string,
  customerType?: string,
  designRequested?: boolean,
  designMessage?: string,
  deliveryEstimate?: string,
  phone?: string,
  vatNumber?: string,
  designFiles?: { name: string; url: string }[],
  country?: string,
): Promise<{ success: boolean; quote_id?: number; quote_url?: string; pdf_url?: string; email_sent?: boolean; error?: string }> {
  const store = WC_STORES[region];
  if (!store) return { success: false, error: `Unknown region: ${region}` };

  const nameParts = (customerName || '').split(' ');
  const firstName = nameParts[0] || '';
  const surname = nameParts.slice(1).join(' ') || '';

  const products = lineItems.map((item: any) => ({
    product_id: item.product_id,
    variation_id: item.variation_id || 0,
    product_name: item.product_name || '',
    quantity: item.quantity,
    price_per_piece: item.price_per_piece || 0,
    custom_price: item.price_per_piece || 0,
    selections: item.selections || {},
    addons: {},
    addon_price_per_piece: 0,
    min_qty: item.min_qty || item.quantity,
    conditional_prices: item.conditional_prices || [],
    image_url: item.image_url || '',
  }));

  const payload = {
    customer_email: customerEmail,
    first_name: firstName,
    surname,
    company: company || '',
    customer_type: customerType || (company ? 'company' : 'individual'),
    phone: phone || '',
    vat_number: vatNumber || '',
    country: country || region,
    products,
    subtotal: totalNet || 0,
    tax_percent: taxPercent || FALLBACK_TAX[region] || 20,
    total: totalGross || 0,
    notes: notes || '',
    quotation_name: quoteName || '',
    delivery_estimate: deliveryEstimate || '',
    design_requested: designRequested || false,
    design_message: designMessage || '',
    design_files: designFiles || [],
    created_by: 'CRM',
  };

  try {
    const resp = await fetch(`${store.url}/wp-json/hercules/v1/create-quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Secret': CRM_QUOTE_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { success: false, error: data.error || `API error ${resp.status}` };
    }

    return {
      success: true,
      quote_id: data.quote_id,
      quote_url: data.quote_url,
      pdf_url: data.pdf_url,
      email_sent: data.email_sent,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Quote API request failed' };
  }
}

/**
 * POST /api/wc/quotes
 *   → All regions: create quote_request via Pearl plugin mu-plugin (PDF + email)
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, customer_email, customer_name, company, customer_type, line_items, total, currency, notes, created_by, quote_name, design_requested, design_message, design_files, delivery_estimate, phone, vat_number, country, tax_percent } = body;

  if (!region || !customer_email || !line_items) {
    return json({ error: 'region, customer_email, and line_items are required' }, 400);
  }

  const items = Array.isArray(line_items) ? line_items : JSON.parse(line_items);
  const firstItem = items[0] || {};

  // Calculate subtotal from all items if not provided in body
  const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + (parseFloat(item.total_net) || 0), 0);

  const siteResult = await createQuoteRequest(
    region,
    items,
    customer_email,
    customer_name,
    company,
    notes,
    body.subtotal || calculatedSubtotal || 0,
    total || body.subtotal * (1 + (tax_percent || FALLBACK_TAX[region] || 20) / 100) || 0,
    tax_percent || firstItem.tax_percent || FALLBACK_TAX[region] || 20,
    quote_name,
    customer_type,
    design_requested,
    design_message,
    delivery_estimate,
    phone,
    vat_number,
    design_files,
    country,
  );

  // Save quote to D1 as well
  const runtime = (locals as any).runtime;
  const db = runtime?.env?.CUSTOMERS_DB;

  if (!db) {
    return json({ error: 'Database not available', site_result: siteResult }, 500);
  }

  const now = new Date().toISOString();
  const lineItemsStr = typeof line_items === 'string' ? line_items : JSON.stringify(line_items);

  const quoteMeta = {
    quote_id: siteResult.quote_id || null,
    quote_url: siteResult.quote_url || null,
    pdf_url: siteResult.pdf_url || null,
    email_sent: siteResult.email_sent || false,
    error: siteResult.error || null,
  };

  const result = await db
    .prepare(
      `INSERT INTO quotes (region, customer_email, customer_name, company, line_items, total, currency, notes, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      region,
      customer_email.toLowerCase().trim(),
      customer_name || null,
      company || null,
      lineItemsStr,
      total || 0,
      currency || 'EUR',
      JSON.stringify({ text: notes || null, ...quoteMeta }),
      siteResult.success ? 'sent' : 'draft',
      now,
      now,
      created_by || null
    )
    .run();

  return json({
    success: true,
    quote_id: result.meta?.last_row_id,
    status: siteResult.success ? 'sent' : 'draft',
    site_quote_id: siteResult.quote_id || null,
    quote_url: siteResult.quote_url || null,
    pdf_url: siteResult.pdf_url || null,
    email_sent: siteResult.email_sent || null,
    site_error: siteResult.error || null,
    created_at: now,
  }, 201);
};

/**
 * GET /api/wc/quotes?email=...&region=...
 *   → List quotes for a customer
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.toLowerCase().trim();

  if (!email) {
    return json({ error: 'email parameter required' }, 400);
  }

  const runtime = (locals as any).runtime;
  const db = runtime?.env?.CUSTOMERS_DB;

  if (!db) {
    return json({ error: 'Database not available' }, 500);
  }

  const region = url.searchParams.get('region');
  let query = 'SELECT * FROM quotes WHERE customer_email = ?';
  const params: string[] = [email];

  if (region) {
    query += ' AND region = ?';
    params.push(region);
  }

  query += ' ORDER BY created_at DESC LIMIT 50';

  const stmt = db.prepare(query);
  const results = await stmt.bind(...params).all();

  return json({
    email,
    quotes: (results.results || []).map((q: any) => ({
      ...q,
      line_items: q.line_items ? JSON.parse(q.line_items) : [],
      notes: q.notes ? JSON.parse(q.notes) : null,
    })),
  });
};
