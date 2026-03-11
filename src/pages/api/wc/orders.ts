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
 * POST /api/wc/orders
 *   → Create a WooCommerce order on the selected region
 *   Body: { region, customer_email, customer_name, company, line_items, total, currency, notes, status }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, customer_email, customer_name, company, line_items, notes, status: orderStatus } = body;

  if (!region || !customer_email || !line_items) {
    return json({ error: 'region, customer_email, and line_items are required' }, 400);
  }

  const store = WC_STORES[region];
  if (!store) {
    return json({ error: `Unknown region: ${region}` }, 400);
  }

  const items = Array.isArray(line_items) ? line_items : JSON.parse(line_items);

  // Look up WC customer_id from D1
  let wcCustomerId = 0;
  const runtime = (locals as any).runtime;
  const db = runtime?.env?.CUSTOMERS_DB;
  if (db) {
    try {
      const row = await db
        .prepare('SELECT wc_customer_id FROM customers WHERE email = ? AND region = ?')
        .bind(customer_email.toLowerCase().trim(), region)
        .first<{ wc_customer_id: number }>();
      if (row) wcCustomerId = row.wc_customer_id;
    } catch {
      // Non-critical — will create as guest order
    }
  }

  const nameParts = (customer_name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Build WC order line items
  const wcLineItems = items.map((item: any) => {
    const lineItem: any = {
      product_id: item.product_id,
      quantity: item.quantity,
    };

    if (item.variation_id) {
      lineItem.variation_id = item.variation_id;
    }

    // Set custom price via subtotal/total (net price × quantity)
    if (item.total_net) {
      lineItem.subtotal = String(item.total_net);
      lineItem.total = String(item.total_net);
    } else if (item.price_per_piece) {
      const lineTotal = (item.price_per_piece * item.quantity).toFixed(2);
      lineItem.subtotal = lineTotal;
      lineItem.total = lineTotal;
    }

    // Store selections/addons as meta data
    const metaData: Array<{ key: string; value: string }> = [];
    if (item.selections) {
      for (const [key, value] of Object.entries(item.selections)) {
        metaData.push({ key, value: String(value) });
      }
    }
    if (item.setup_fee && item.setup_fee !== 'Free') {
      metaData.push({ key: 'Setup Fee', value: item.setup_fee });
    }
    if (item.shipping && item.shipping !== 'Free') {
      metaData.push({ key: 'Shipping', value: item.shipping });
    }
    if (metaData.length > 0) {
      lineItem.meta_data = metaData;
    }

    return lineItem;
  });

  // Build WC order payload
  const orderPayload: any = {
    status: orderStatus || 'processing',
    customer_id: wcCustomerId,
    billing: {
      first_name: firstName,
      last_name: lastName,
      email: customer_email.toLowerCase().trim(),
      company: company || '',
    },
    line_items: wcLineItems,
    set_paid: true,
  };

  if (notes) {
    orderPayload.customer_note = notes;
  }

  const auth = btoa(`${store.ck}:${store.cs}`);

  try {
    const resp = await fetch(`${store.url}/wp-json/wc/v3/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return json({
        success: false,
        error: data.message || `WC API error ${resp.status}`,
        details: data,
      }, resp.status);
    }

    return json({
      success: true,
      order_id: data.id,
      order_number: data.number,
      order_status: data.status,
      order_total: data.total,
      order_url: `${store.url}/wp-admin/post.php?post=${data.id}&action=edit`,
      region,
    }, 201);
  } catch (err: any) {
    return json({ success: false, error: err.message || 'Network error' }, 500);
  }
};
