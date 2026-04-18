import type { APIRoute } from 'astro';
import { getWcStores } from '../../../lib/wc-stores';

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
  const runtime = (locals as any).runtime;
  const WC_STORES = getWcStores(runtime?.env || {});
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { region, customer_email, customer_name, company, customer_type, line_items, notes, status: orderStatus, phone, vat_number, country, payment_method, design_requested, design_message, design_files } = body;

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
  const isPaymentLink = payment_method === 'payment_link';
  const orderPayload: any = {
    status: 'pending',
    payment_method: isPaymentLink ? '' : 'bacs',
    payment_method_title: isPaymentLink ? '' : 'Manuelle Banküberweisung',
    customer_id: wcCustomerId,
    billing: {
      first_name: firstName,
      last_name: lastName,
      email: customer_email.toLowerCase().trim(),
      company: company || '',
      phone: phone || '',
      country: country || '',
    },
    shipping: {
      first_name: firstName,
      last_name: lastName,
      company: company || '',
      country: country || '',
    },
    line_items: wcLineItems,
    set_paid: false,
    meta_data: [] as Array<{ key: string; value: string }>,
  };

  // Flag CRM payment-link orders so the mu-plugin can inject bank details into the email
  if (isPaymentLink) {
    orderPayload.meta_data.push({ key: '_crm_payment_link', value: 'yes' });
  }

  // Add VAT number as order meta
  if (vat_number) {
    orderPayload.meta_data.push({ key: '_billing_vat_number', value: vat_number });
    orderPayload.meta_data.push({ key: '_vat_number', value: vat_number });
  }

  // Add customer type as order meta
  if (customer_type) {
    orderPayload.meta_data.push({ key: '_customer_type', value: customer_type });
  }

  // Add design request info as order meta
  if (design_requested) {
    orderPayload.meta_data.push({ key: '_design_requested', value: 'yes' });
    if (design_message) {
      orderPayload.meta_data.push({ key: '_design_message', value: design_message });
    }
    if (Array.isArray(design_files) && design_files.length > 0) {
      orderPayload.meta_data.push({
        key: '_design_files',
        value: JSON.stringify(design_files),
      });
    }
  }

  if (notes) {
    orderPayload.customer_note = notes;
  }

  // Build a note with design info for visibility in WP admin
  if (design_requested) {
    const designNote = [
      'Design Request from CRM:',
      design_message ? `Message: ${design_message}` : '',
      ...(Array.isArray(design_files) ? design_files.map((f: any) => `File: ${f.name} — ${f.url}`) : []),
    ].filter(Boolean).join('\n');
    if (designNote) {
      orderPayload.customer_note = [notes, designNote].filter(Boolean).join('\n\n');
    }
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

    const rawText = await resp.text();
    let data: any;
    try {
      // WC API may prepend HTML (e.g. from PDF invoice plugin) — strip it
      // Look for JSON object pattern starting with {"
      const jsonMatch = rawText.match(/\{"\w/);
      const jsonStart = jsonMatch ? rawText.indexOf(jsonMatch[0]) : -1;
      const cleanJson = jsonStart >= 0 ? rawText.slice(jsonStart) : rawText;
      data = JSON.parse(cleanJson);
    } catch {
      return json({ success: false, error: `WooCommerce returned invalid response: ${rawText.slice(0, 300)}` }, 502);
    }

    if (!resp.ok) {
      return json({
        success: false,
        error: data.message || `WC API error ${resp.status}`,
        details: data,
      }, resp.status);
    }

    let finalStatus = data.status;
    let paymentUrl = data.payment_url || null;

    // For bank transfer orders: transition pending → on-hold to trigger WC "On Hold" email
    if (!isPaymentLink && data.id) {
      try {
        const updateResp = await fetch(`${store.url}/wp-json/wc/v3/orders/${data.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({ status: 'on-hold' }),
        });
        if (updateResp.ok) finalStatus = 'on-hold';
      } catch {
        // Non-critical — order was created, status update failed
      }
    }

    // For payment link orders: send Customer Invoice email with pay link + bank details
    if (isPaymentLink && data.id) {
      try {
        await fetch(`${store.url}/wp-json/hercules/v1/send-payment-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CRM-Secret': runtime?.env?.CRM_QUOTE_SECRET || '',
          },
          body: JSON.stringify({ order_id: data.id }),
        });
      } catch {
        // Non-critical — order was created, email just didn't trigger
      }
    }

    return json({
      success: true,
      order_id: data.id,
      order_number: data.number,
      order_status: finalStatus,
      order_total: data.total,
      order_url: `${store.url}/wp-admin/post.php?post=${data.id}&action=edit`,
      payment_url: paymentUrl,
      region,
    }, 201);
  } catch (err: any) {
    return json({ success: false, error: err.message || 'Network error' }, 500);
  }
};
