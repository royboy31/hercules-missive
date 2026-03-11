import type { CustomerLookupResult } from './types';

const BASE = '/api/wc';

export async function lookupCustomer(email: string): Promise<CustomerLookupResult> {
  const res = await fetch(`${BASE}/customers?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`Customer lookup failed: ${res.status}`);
  return res.json();
}

export async function createCustomer(data: {
  region: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
}) {
  const res = await fetch(`${BASE}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `Create customer failed: ${res.status}`);
  }
  return res.json();
}
