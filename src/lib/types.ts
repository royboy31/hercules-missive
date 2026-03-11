export interface RegionInfo {
  code: string;
  name: string;
  currency: string;
}

export const REGIONS: RegionInfo[] = [
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'UK', name: 'United Kingdom', currency: 'GBP' },
  { code: 'FR', name: 'France', currency: 'EUR' },
];

export interface CustomerMatch {
  found: boolean;
  wc_customer_id?: number;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  synced_at?: string;
}

export interface CustomerLookupResult {
  email: string;
  regions: Record<string, CustomerMatch>;
}
