import { useState, useEffect, useCallback, useRef } from 'react';
import SidebarProductList from './SidebarProductList';
import SidebarConfigurator, { type CartItemData } from './SidebarConfigurator';

declare const Missive: any;

// ── Types ────────────────────────────────────────────────────────────

interface Contact {
  email: string;
  name: string;
}

interface RegionMatch {
  found: boolean;
  wc_customer_id?: number;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  vat_number?: string;
  customer_type?: string;
  country?: string;
  notes?: string;
  orders_count?: number;
  total_spent?: string;
}

interface CartItem extends CartItemData {
  id: string;
}

type Screen =
  | { type: 'empty' }
  | { type: 'loading' }
  | { type: 'pick-email'; contacts: Contact[] }
  | { type: 'main' }
  | { type: 'products' }
  | { type: 'configurator'; productId: number; productName: string };

interface SubmitResult {
  success: boolean;
  error?: string;
  quote_id?: number;
  site_quote_id?: number;
  quote_url?: string;
  pdf_url?: string;
  email_sent?: boolean;
  site_error?: string;
  order_id?: number;
  order_number?: string;
  order_url?: string;
  order_status?: string;
  payment_url?: string;
}

interface CustomerSearchResult {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  region: string;
}

// ── Constants ────────────────────────────────────────────────────────

const REGION_ORDER = ['DE', 'UK', 'FR'];
const REGION_NAMES: Record<string, string> = { DE: 'Germany', UK: 'United Kingdom', FR: 'France' };
// Fallback tax rates — only used when WC tax-rate API is unavailable
const FALLBACK_VAT: Record<string, number> = { DE: 19, UK: 20, FR: 20 };

// Country code → display name mapping
const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', AT: 'Austria', CH: 'Switzerland', FR: 'France', BE: 'Belgium',
  NL: 'Netherlands', LU: 'Luxembourg', IT: 'Italy', ES: 'Spain', PT: 'Portugal',
  PL: 'Poland', CZ: 'Czech Republic', GB: 'United Kingdom', IE: 'Ireland',
  DK: 'Denmark', SE: 'Sweden', NO: 'Norway', FI: 'Finland', HU: 'Hungary',
  RO: 'Romania', BG: 'Bulgaria', HR: 'Croatia', SK: 'Slovakia', SI: 'Slovenia',
  EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', GR: 'Greece', CY: 'Cyprus', MT: 'Malta',
};
const INTERNAL_DOMAINS = [
  '@hercules-merchandise.com',
  '@hercules-merchandise.de',
  '@hercules-merchandise.co.uk',
  '@hercules-merchandising.fr',
  '@missiveapp.com',
];

// KV cart key prefix
const CART_KV_PREFIX = 'hercules_cart_';

function getCartKey(email: string, region: string) {
  return `${CART_KV_PREFIX}${email.toLowerCase()}_${region}`;
}

function saveCartToKV(email: string, region: string, cart: CartItem[]) {
  try {
    localStorage.setItem(getCartKey(email, region), JSON.stringify(cart));
  } catch { /* quota exceeded or unavailable */ }
}

function loadCartFromKV(email: string, region: string): CartItem[] {
  try {
    const raw = localStorage.getItem(getCartKey(email, region));
    if (raw) return JSON.parse(raw);
  } catch { /* parse error */ }
  return [];
}

function clearCartKV(email: string, region: string) {
  try {
    localStorage.removeItem(getCartKey(email, region));
  } catch { /* ignore */ }
}

// ── Icons ────────────────────────────────────────────────────────────

function CustomerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function DeliveryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#10c99e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2-1 2 1 2-1 2 1zm0 0h6a1 1 0 001-1V9a1 1 0 00-1-1h-3l-3 3v5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-gray-200 border-t-[#253461] rounded-full animate-spin mx-auto" />;
}

// ── Main Component ───────────────────────────────────────────────────

export default function SidebarAppV3() {
  // Mode
  const [mode, setMode] = useState<'quote' | 'order'>('quote');

  // Screen state machine
  const [screen, setScreen] = useState<Screen>({ type: 'empty' });

  // Customer
  const [customer, setCustomer] = useState<{ email: string; name: string; company: string; phone: string; vatNumber: string; customerType: string; country: string; address1: string; address2: string; city: string; postcode: string; notes: string; ordersCount: number; totalSpent: string } | null>(null);
  const [customerSearchMode, setCustomerSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Customer editing
  const [editingCustomer, setEditingCustomer] = useState(false);
  const editingCustomerRef = useRef(false);
  const currentConversationIdsRef = useRef<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editVatNumber, setEditVatNumber] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editAddress1, setEditAddress1] = useState('');
  const [editAddress2, setEditAddress2] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPostcode, setEditPostcode] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // New customer form
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newVatNumber, setNewVatNumber] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Regions
  const [regions, setRegions] = useState<Record<string, RegionMatch>>({});
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);

  // Summary
  const [internalNote, setInternalNote] = useState('');
  const [quoteName, setQuoteName] = useState(`Quote - ${new Date().toISOString().slice(0, 10)}`);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [customDelivery, setCustomDelivery] = useState('');
  const [subtotalOverride, setSubtotalOverride] = useState<string | null>(null);
  const [totalOverride, setTotalOverride] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<'individual' | 'company' | 'association'>('individual');
  const [orgName, setOrgName] = useState('');
  const [designRequested, setDesignRequested] = useState(false);
  const [designMessage, setDesignMessage] = useState('');
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const designFileInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bacs' | 'payment_link'>('bacs');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  // Dynamic VAT rate from WooCommerce
  const [dynamicVatRate, setDynamicVatRate] = useState<number | null>(null);
  const [vatRateLoading, setVatRateLoading] = useState(false);

  // Available countries (fetched from WC tax table for the selected region)
  const [countryOptions, setCountryOptions] = useState<{ code: string; rate: number }[]>([]);

  // Customer creation for new-region
  const [creatingRegionUser, setCreatingRegionUser] = useState(false);
  const [createRegionError, setCreateRegionError] = useState<string | null>(null);

  // ── Persist cart to KV (localStorage) on every change ─────────────

  useEffect(() => {
    if (customer?.email && selectedRegion && cart.length > 0) {
      saveCartToKV(customer.email, selectedRegion, cart);
    }
  }, [cart, customer?.email, selectedRegion]);

  // ── Fetch available countries from WooCommerce tax table ────────

  useEffect(() => {
    if (!selectedRegion) {
      setCountryOptions([]);
      return;
    }
    fetch(`/api/wc/tax-rates?region=${selectedRegion}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.countries)) {
          setCountryOptions(data.countries);
        }
      })
      .catch(() => setCountryOptions([]));
  }, [selectedRegion]);

  // ── Fetch dynamic VAT rate from WooCommerce ─────────────────────

  useEffect(() => {
    if (!selectedRegion || !customer?.country) {
      setDynamicVatRate(null);
      return;
    }
    setVatRateLoading(true);
    fetch(`/api/wc/tax-rates?region=${selectedRegion}&country=${encodeURIComponent(customer.country)}`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.rate === 'number') {
          setDynamicVatRate(data.rate);
        } else {
          setDynamicVatRate(null);
        }
      })
      .catch(() => setDynamicVatRate(null))
      .finally(() => setVatRateLoading(false));
  }, [selectedRegion, customer?.country]);

  // ── Missive Integration ──────────────────────────────────────────

  useEffect(() => {
    if (typeof Missive === 'undefined') {
      // No Missive — go straight to main with search mode (standalone/testing)
      setScreen({ type: 'main' });
      setCustomerSearchMode(true);
      return;
    }

    function isExternal(address: string) {
      const lower = address.toLowerCase();
      return !INTERNAL_DOMAINS.some((d) => lower.endsWith(d));
    }

    function handleConversations(conversations: any[]) {
      if (!conversations || conversations.length === 0) {
        setScreen({ type: 'empty' });
        return;
      }

      // Try standard method first
      let addressFields: any[] = [];
      try {
        addressFields = Missive.getEmailAddresses(conversations);
      } catch {
        addressFields = [];
      }

      // Fallback: extract from conversation contacts/messages directly
      if (!addressFields || addressFields.length === 0) {
        for (const conv of conversations) {
          // Try conversation.latest_message or conversation.messages
          if (conv.latest_message?.from_field) {
            const f = conv.latest_message.from_field;
            if (f.address) addressFields.push(f);
          }
          if (conv.latest_message?.to_fields) {
            for (const t of conv.latest_message.to_fields) {
              if (t.address) addressFields.push(t);
            }
          }
          // Try assignees / contact fields
          if (conv.email_conversation?.from_field) {
            addressFields.push(conv.email_conversation.from_field);
          }
        }
      }

      const seen = new Set<string>();
      const contacts: Contact[] = [];

      for (const field of addressFields) {
        if (!field.address) continue;
        const email = field.address.toLowerCase();
        if (seen.has(email) || !isExternal(email)) continue;
        seen.add(email);
        contacts.push({ email, name: field.name || '' });
      }

      if (contacts.length === 0) {
        setScreen({ type: 'empty' });
      } else if (contacts.length === 1) {
        selectCustomerByEmail(contacts[0].email, contacts[0].name);
      } else {
        setScreen({ type: 'pick-email', contacts });
      }
    }

    Missive.on(
      'change:conversations',
      (ids: string[]) => {
        if (!ids || ids.length === 0) {
          setScreen({ type: 'empty' });
          return;
        }
        // Skip reload if same conversation and user is editing
        const idsKey = ids.sort().join(',');
        if (editingCustomerRef.current && currentConversationIdsRef.current === idsKey) {
          return;
        }
        currentConversationIdsRef.current = idsKey;
        setScreen({ type: 'loading' });
        Missive.fetchConversations(ids).then(handleConversations);
      },
      { retroactive: true }
    );
  }, []);

  // ── Customer Lookup ──────────────────────────────────────────────

  const selectCustomerByEmail = useCallback((email: string, name: string, extra?: { company?: string; phone?: string; vatNumber?: string; address1?: string; address2?: string; city?: string; postcode?: string }) => {
    setCustomer({ email, name, company: extra?.company || '', phone: extra?.phone || '', vatNumber: extra?.vatNumber || '', customerType: '', country: '', address1: extra?.address1 || '', address2: extra?.address2 || '', city: extra?.city || '', postcode: extra?.postcode || '', notes: '', ordersCount: 0, totalSpent: '0.00' });
    setCustomerSearchMode(false);
    setSearchQuery('');
    setShowNewCustomerForm(false);
    setSelectedRegion(null);
    setRegions({});
    setCart([]);
    setSubmitResult(null);
    setScreen({ type: 'main' });
    setCustomerType('individual');
    setOrgName('');

    // Fetch regions
    setRegionsLoading(true);
    fetch(`/api/wc/customers?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data) => {
        const regs = data.regions || {};
        setRegions(regs);

        // Extract additional customer data — aggregate across all regions
        let totalOrders = 0;
        let totalSpent = 0;
        let bestName = '';
        let bestCompany = '';
        let bestPhone = '';
        let bestVat = '';
        let bestType = 'individual';
        let bestCountry = '';
        let bestAddress1 = '';
        let bestAddress2 = '';
        let bestCity = '';
        let bestPostcode = '';
        let bestNotes = '';

        for (const code of REGION_ORDER) {
          const match = regs[code];
          if (match?.found) {
            if (!bestName) bestName = [match.first_name, match.last_name].filter(Boolean).join(' ');
            if (!bestCompany && match.company) bestCompany = match.company;
            if (!bestPhone && match.phone) bestPhone = match.phone;
            if (!bestVat && match.vat_number) bestVat = match.vat_number;
            if (match.customer_type === 'organization') bestType = 'organization';
            if (!bestCountry && match.country) bestCountry = match.country;
            if (!bestAddress1 && match.address_1) bestAddress1 = match.address_1;
            if (!bestAddress2 && match.address_2) bestAddress2 = match.address_2;
            if (!bestCity && match.city) bestCity = match.city;
            if (!bestPostcode && match.postcode) bestPostcode = match.postcode;
            if (!bestNotes && match.notes) bestNotes = match.notes;
            totalOrders += match.orders_count || 0;
            totalSpent += parseFloat(match.total_spent || '0');
          }
        }

        setCustomer((prev) =>
          prev
            ? {
                ...prev,
                name: bestName || prev.name,
                company: bestCompany || prev.company,
                phone: bestPhone || prev.phone,
                vatNumber: bestVat,
                customerType: bestType,
                country: bestCountry,
                address1: bestAddress1,
                address2: bestAddress2,
                city: bestCity,
                postcode: bestPostcode,
                notes: bestNotes,
                ordersCount: totalOrders,
                totalSpent: totalSpent.toFixed(2),
              }
            : prev
        );
        // Auto-set customer type and org name from WC data
        if (bestType === 'organization' || bestCompany) {
          setCustomerType('company');
          if (bestCompany) setOrgName(bestCompany);
        }
      })
      .catch(() => setRegions({}))
      .finally(() => setRegionsLoading(false));
  }, []);

  // ── Customer Search ──────────────────────────────────────────────

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(() => {
      fetch(`/api/wc/customers?search=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => r.json())
        .then((data) => setSearchResults(data.results || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // ── Cart Handlers ────────────────────────────────────────────────

  const handleAddToCart = useCallback(
    (itemData: CartItemData) => {
      if (editingCartItemId) {
        setCart((prev) =>
          prev.map((ci) => (ci.id === editingCartItemId ? { ...itemData, id: ci.id } : ci))
        );
        setEditingCartItemId(null);
      } else {
        setCart((prev) => [...prev, { ...itemData, id: crypto.randomUUID() }]);
      }
      setScreen({ type: 'main' });
    },
    [editingCartItemId]
  );

  const removeItem = (id: string) => {
    setCart((prev) => {
      const next = prev.filter((i) => i.id !== id);
      // Clear KV if cart is now empty
      if (next.length === 0 && customer?.email && selectedRegion) {
        clearCartKV(customer.email, selectedRegion);
      }
      return next;
    });
  };

  const duplicateItem = (id: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: crypto.randomUUID() };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const editItem = (item: CartItem) => {
    setEditingCartItemId(item.id);
    setScreen({ type: 'configurator', productId: item.productId, productName: item.productName });
  };

  const updateItem = (id: string, updates: { quantity: number; pricePerPiece: number }) => {
    setCart((prev) =>
      prev.map((ci) => {
        if (ci.id !== id) return ci;
        const priceChanged = Math.abs(ci.pricePerPiece - updates.pricePerPiece) > 0.001;
        return {
          ...ci,
          quantity: updates.quantity,
          pricePerPiece: updates.pricePerPiece,
          lineTotal: updates.quantity * updates.pricePerPiece,
          isManualPrice: ci.isManualPrice || priceChanged,
        };
      })
    );
  };

  // ── Region Switching ─────────────────────────────────────────────

  const handleRegionSelect = (code: string) => {
    if (cart.length > 0 && selectedRegion && code !== selectedRegion) {
      if (!confirm('Changing region will clear your cart. Continue?')) return;
      if (customer?.email && selectedRegion) clearCartKV(customer.email, selectedRegion);
      setCart([]);
      setSubmitResult(null);
    }
    setSelectedRegion(code);
    setCreateRegionError(null);

    // Load persisted cart for this customer+region
    if (customer?.email) {
      const saved = loadCartFromKV(customer.email, code);
      if (saved.length > 0) setCart(saved);
    }
  };

  // ── Proceed to products (virtual cart — no WC customer creation yet) ──

  const handleProceedToProducts = () => {
    if (!selectedRegion || !customer) return;
    const match = regions[selectedRegion];

    if (match?.found) {
      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              ordersCount: match.orders_count || prev.ordersCount,
              totalSpent: match.total_spent || prev.totalSpent,
              company: match.company || prev.company,
              phone: match.phone || prev.phone,
              vatNumber: match.vat_number || prev.vatNumber,
              customerType: match.customer_type || prev.customerType,
              country: match.country || prev.country,
              address1: match.address_1 || prev.address1,
              address2: match.address_2 || prev.address2,
              city: match.city || prev.city,
              postcode: match.postcode || prev.postcode,
              notes: match.notes || prev.notes,
            }
          : prev
      );
    }
    setScreen({ type: 'products' });
  };

  // ── Submit Quote/Order ───────────────────────────────────────────

  const handleSubmit = async (openPdf = false) => {
    if (!selectedRegion || !customer || cart.length === 0) return;

    setSubmitting(true);
    setSubmitResult(null);

    const currency = selectedRegion === 'UK' ? 'GBP' : 'EUR';
    // VAT exemption per region (same rules as computed values above)
    // No region / UK: NEVER exempt — always charge VAT regardless of VAT number
    const submitVatExempt = (() => {
      if (!selectedRegion) return false; // No region: never exempt
      if (selectedRegion === 'UK') return false; // UK: always charge VAT
      const vat = (customer?.vatNumber || '').replace(/\s+/g, '').toUpperCase();
      if (!vat) return false;
      if (selectedRegion === 'DE') return true;
      if (selectedRegion === 'FR') return /^FR[0-9A-Z]{2}\d{9}$/.test(vat);
      return false;
    })();
    // UK: ALWAYS use fallback VAT (20%) - ignore dynamicVatRate entirely
    // No region: use default 20%
    const submitBaseVat = (() => {
      if (!selectedRegion) return 20;
      if (selectedRegion === 'UK') return FALLBACK_VAT['UK'] || 20;
      return dynamicVatRate !== null ? dynamicVatRate : (FALLBACK_VAT[selectedRegion] || 20);
    })();
    const vatPct = submitVatExempt ? 0 : submitBaseVat;
    const cartSub = cart.reduce((s, i) => s + i.lineTotal, 0);
    const sub = totalOverride !== null
      ? Math.round(parseFloat(totalOverride || '0') / (1 + vatPct / 100) * 100) / 100
      : subtotalOverride !== null
        ? parseFloat(subtotalOverride) || 0
        : cartSub;
    const totalGross = totalOverride !== null
      ? parseFloat(totalOverride || '0')
      : Math.round(sub * (1 + vatPct / 100) * 100) / 100;

    // Only hide the comparison table if totals were actually changed to different values
    // (not just because user clicked on the editable field)
    const calculatedSubtotal = cartSub;
    const calculatedTotal = Math.round(cartSub * (1 + vatPct / 100) * 100) / 100;
    const hasTotalOverride = (subtotalOverride !== null && Math.abs(parseFloat(subtotalOverride) - calculatedSubtotal) > 0.01) ||
                             (totalOverride !== null && Math.abs(parseFloat(totalOverride) - calculatedTotal) > 0.01);

    const lineItems = cart.map((item) => {
      // Hide comparison table if:
      // 1. Totals were manually overridden, OR
      // 2. This item's quantity is below its minimum, OR
      // 3. This item's quantity is above its maximum, OR
      // 4. This item has a manually changed price (isManualPrice flag from configurator), OR
      // 5. This item has a custom quantity (doesn't match any tier)
      const qtyBelowMin = item.minQty > 0 && item.quantity < item.minQty;
      const qtyAboveMax = item.maxQty > 0 && item.quantity > item.maxQty;

      const hideComparison = hasTotalOverride || qtyBelowMin || qtyAboveMax || item.isManualPrice || item.isCustomQty;

      return {
        product_id: item.productId,
        product_name: item.productName,
        variation_id: item.variationId,
        quantity: item.quantity,
        price_per_piece: item.pricePerPiece,
        total_net: item.lineTotal,
        total_gross: Math.round(item.lineTotal * (1 + vatPct / 100) * 100) / 100,
        tax_percent: vatPct,
        setup_fee: item.setupFee,
        shipping: item.shipping,
        lead_time: item.leadTime,
        selections: item.selections,
        image_url: item.imageUrl || '',
        // Clear conditional_prices if totals overridden, quantity outside min/max range, or price manually changed
        conditional_prices: hideComparison ? [] : (item.conditionalPrices || []),
        min_qty: item.minQty || 0,
        max_qty: item.maxQty || 0,
      };
    });

    try {
      // Upload design files to R2 if requested
      let designFileUrls: { name: string; url: string }[] = [];
      if (designRequested && designFiles.length > 0) {
        const filePayloads = await Promise.all(
          designFiles.map(async (file) => {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            return { name: file.name, type: file.type, data: btoa(binary) };
          })
        );
        const uploadResp = await fetch('/api/wc/upload-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filePayloads }),
        });
        const uploadData = await uploadResp.json();
        if (uploadData.success && uploadData.files) {
          // Convert relative URLs to absolute
          const origin = window.location.origin;
          designFileUrls = uploadData.files.map((f: any) => ({
            name: f.name,
            url: f.url.startsWith('/') ? origin + f.url : f.url,
          }));
        }
      }

      // Create WC customer on this region if they don't exist yet
      const regionMatch = regions[selectedRegion];
      if (!regionMatch?.found) {
        setCreatingRegionUser(true);
        setCreateRegionError(null);
        try {
          const nameParts = customer.name.split(' ');
          const createResp = await fetch('/api/wc/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              region: selectedRegion,
              email: customer.email,
              first_name: nameParts[0] || '',
              last_name: nameParts.slice(1).join(' ') || '',
              company: customer.company || '',
            }),
          });
          const createData = await createResp.json();
          if (createResp.ok && !createData.error) {
            setRegions((prev) => ({
              ...prev,
              [selectedRegion]: {
                found: true,
                first_name: createData.first_name || nameParts[0] || '',
                last_name: createData.last_name || '',
                company: createData.company || '',
                wc_customer_id: createData.wc_customer_id,
              },
            }));
          } else if (!createData.already_exists) {
            setCreateRegionError(createData.error || 'Failed to create customer');
            setSubmitting(false);
            setCreatingRegionUser(false);
            return;
          }
        } catch (err: any) {
          setCreateRegionError(err.message || 'Network error creating customer');
          setSubmitting(false);
          setCreatingRegionUser(false);
          return;
        } finally {
          setCreatingRegionUser(false);
        }
      }

      if (mode === 'order') {
        const resp = await fetch('/api/wc/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region: selectedRegion,
            customer_email: customer.email,
            customer_name: customer.name,
            company: customerType !== 'individual' ? (orgName || customer.company) : customer.company,
            customer_type: customerType,
            line_items: lineItems,
            total: totalGross,
            notes: internalNote || '',
            phone: customer.phone || '',
            vat_number: customer.vatNumber || '',
            country: customer.country || '',
            payment_method: paymentMethod,
            design_requested: designRequested,
            design_message: designRequested ? designMessage : '',
            design_files: designFileUrls,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          setSubmitResult({
            success: true,
            order_id: data.order_id,
            order_number: data.order_number,
            order_url: data.order_url,
            order_status: data.order_status,
            payment_url: data.payment_url,
          });
          // Clear persisted cart on successful submit
          clearCartKV(customer.email, selectedRegion);
          // Reset to initial state (keep customer & region, clear cart/form)
          setCart([]);
          setQuoteName('');
          setInternalNote('');
          setDesignRequested(false);
          setDesignMessage('');
          setDesignFiles([]);
          setCustomDelivery('');
          setEditingDelivery(false);
          setSubtotalOverride(null);

          setTotalOverride(null);
        } else {
          setSubmitResult({ success: false, error: data.error || 'Failed to create order' });
        }
      } else {
        const resp = await fetch('/api/wc/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region: selectedRegion,
            customer_email: customer.email,
            customer_name: customer.name,
            company: customerType !== 'individual' ? (orgName || customer.company) : customer.company,
            customer_type: customerType,
            line_items: lineItems,
            subtotal: sub,
            total: totalGross,
            currency,
            notes: internalNote || '',
            quote_name: quoteName || cart.map((c) => c.productName).join(' + '),
            delivery_estimate: deliveryEstimate || '',
            design_requested: designRequested,
            design_message: designRequested ? designMessage : '',
            design_files: designFileUrls,
            phone: customer.phone || '',
            vat_number: customer.vatNumber || '',
            country: customer.country || '',
            tax_percent: vatPct,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          setSubmitResult({
            success: true,
            quote_id: data.quote_id,
            site_quote_id: data.site_quote_id,
            quote_url: data.quote_url,
            pdf_url: data.pdf_url,
            email_sent: data.email_sent,
            site_error: data.site_error,
          });
          // Clear persisted cart on successful submit
          clearCartKV(customer.email, selectedRegion);
          if (openPdf && data.pdf_url) {
            window.open(data.pdf_url, '_blank');
          }
          // Reset to initial state (keep customer & region, clear cart/form)
          setCart([]);
          setQuoteName('');
          setInternalNote('');
          setDesignRequested(false);
          setDesignMessage('');
          setDesignFiles([]);
          setCustomDelivery('');
          setEditingDelivery(false);
          setSubtotalOverride(null);

          setTotalOverride(null);
        } else {
          setSubmitResult({ success: false, error: data.error || 'Failed to create quote' });
        }
      }
    } catch (err: any) {
      setSubmitResult({ success: false, error: err.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── New Customer Form Submit ─────────────────────────────────────

  const handleNewCustomer = async () => {
    if (!newEmail.trim()) return;
    setCreatingCustomer(true);
    try {
      selectCustomerByEmail(newEmail.trim().toLowerCase(), newName.trim(), {
        company: newCompany.trim(),
        phone: newPhone.trim(),
        vatNumber: newVatNumber.trim(),
      });
    } finally {
      setCreatingCustomer(false);
      setShowNewCustomerForm(false);
      setNewEmail('');
      setNewName('');
      setNewCompany('');
      setNewPhone('');
      setNewVatNumber('');
    }
  };

  // ── Customer Edit ───────────────────────────────────────────────

  // Find the best region to use for editing (selected > first found)
  const getEditRegion = (): { code: string; match: RegionMatch } | null => {
    if (selectedRegion && regions[selectedRegion]?.wc_customer_id) {
      return { code: selectedRegion, match: regions[selectedRegion] };
    }
    for (const code of REGION_ORDER) {
      const match = regions[code];
      if (match?.found && match.wc_customer_id) {
        return { code, match };
      }
    }
    return null;
  };

  const startEditCustomer = () => {
    if (!customer) return;
    const parts = customer.name.split(' ');
    setEditFirstName(parts[0] || '');
    setEditLastName(parts.slice(1).join(' ') || '');
    setEditCompany(customer.company || '');
    setEditPhone(customer.phone || '');
    setEditVatNumber(customer.vatNumber || '');
    setEditCountry(customer.country || '');
    setEditAddress1(customer.address1 || '');
    setEditAddress2(customer.address2 || '');
    setEditCity(customer.city || '');
    setEditPostcode(customer.postcode || '');
    setEditNotes(customer.notes || '');
    setEditingCustomer(true);
    editingCustomerRef.current = true;
  };

  const saveCustomerEdit = async () => {
    if (!customer) return;

    // Update all regions where customer exists
    const regionsToUpdate = REGION_ORDER.filter(
      (code) => regions[code]?.found && regions[code]?.wc_customer_id
    );

    // If customer doesn't exist in any region (new customer), just update local state
    if (regionsToUpdate.length === 0) {
      const newName = [editFirstName.trim(), editLastName.trim()].filter(Boolean).join(' ');
      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              name: newName || prev.name,
              company: editCompany.trim(),
              phone: editPhone.trim(),
              vatNumber: editVatNumber.trim(),
              country: editCountry.trim(),
              address1: editAddress1.trim(),
              address2: editAddress2.trim(),
              city: editCity.trim(),
              postcode: editPostcode.trim(),
              notes: editNotes.trim(),
            }
          : prev
      );
      setEditingCustomer(false);
      editingCustomerRef.current = false;
      return;
    }

    setSavingCustomer(true);
    try {
      const results = await Promise.all(
        regionsToUpdate.map(async (code) => {
          const resp = await fetch('/api/wc/customers', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              region: code,
              wc_customer_id: regions[code].wc_customer_id,
              first_name: editFirstName.trim(),
              last_name: editLastName.trim(),
              company: editCompany.trim(),
              phone: editPhone.trim(),
              vat_number: editVatNumber.trim(),
              country: editCountry.trim(),
              address_1: editAddress1.trim(),
              address_2: editAddress2.trim(),
              city: editCity.trim(),
              postcode: editPostcode.trim(),
              notes: editNotes.trim(),
            }),
          });
          return { code, resp };
        })
      );

      // Use first successful response for state update
      for (const { code, resp } of results) {
        if (resp.ok) {
          const data = await resp.json();
          if (data.success) {
            const newName = [data.first_name, data.last_name].filter(Boolean).join(' ');
            setCustomer((prev) =>
              prev
                ? {
                    ...prev,
                    name: newName || prev.name,
                    company: data.company || '',
                    phone: data.phone || '',
                    vatNumber: data.vat_number || '',
                    customerType: data.customer_type || prev.customerType,
                    country: data.country || prev.country,
                    address1: data.address_1 || '',
                    address2: data.address_2 || '',
                    city: data.city || '',
                    postcode: data.postcode || '',
                    notes: data.notes !== undefined ? data.notes : prev.notes,
                  }
                : prev
            );
            // Update all region data
            setRegions((prev) => {
              const updated = { ...prev };
              for (const rc of regionsToUpdate) {
                if (updated[rc]?.found) {
                  updated[rc] = {
                    ...updated[rc],
                    first_name: data.first_name,
                    last_name: data.last_name,
                    company: data.company,
                    phone: data.phone,
                    vat_number: data.vat_number,
                    customer_type: data.customer_type,
                    country: data.country,
                    notes: data.notes,
                  };
                }
              }
              return updated;
            });
            { setEditingCustomer(false); editingCustomerRef.current = false; };
            break;
          }
        }
      }
    } catch { /* ignore */ }
    finally { setSavingCustomer(false); }
  };

  // ── Computed values ──────────────────────────────────────────────

  const currencySymbol = selectedRegion === 'UK' ? '£' : '€';
  // UK: ALWAYS use fallback VAT (20%) - ignore dynamicVatRate and VAT number entirely
  // No region: use default 20%
  const baseVatPercent = (() => {
    if (!selectedRegion) return 20; // No region selected: default to 20%
    if (selectedRegion === 'UK') return FALLBACK_VAT['UK'] || 20; // UK: always 20%
    return dynamicVatRate !== null ? dynamicVatRate : (FALLBACK_VAT[selectedRegion] || 20);
  })();
  // VAT exemption rules per region (matching each site's checkout logic):
  // No region / UK: NEVER exempt — always charge VAT regardless of VAT number
  // DE: any VAT number → exempt
  // FR: VAT exempt only if VAT number matches FR format (FR + 2 chars + 9 digits)
  const isVatExempt = (() => {
    if (!selectedRegion) return false; // No region: never exempt
    if (selectedRegion === 'UK') return false; // UK: NEVER exempt, always charge VAT
    const vat = (customer?.vatNumber || '').replace(/\s+/g, '').toUpperCase();
    if (!vat) return false;
    if (selectedRegion === 'DE') return true; // DE: any VAT → exempt
    if (selectedRegion === 'FR') return /^FR[0-9A-Z]{2}\d{9}$/.test(vat); // FR: must be valid FR VAT
    return false;
  })();
  const vatPercent = isVatExempt ? 0 : baseVatPercent;
  const cartSubtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  // If user overrode total, back-calculate subtotal & VAT from it
  // If user overrode subtotal, forward-calculate VAT & total from it
  const subtotal = totalOverride !== null
    ? Math.round(parseFloat(totalOverride || '0') / (1 + vatPercent / 100) * 100) / 100
    : subtotalOverride !== null
      ? parseFloat(subtotalOverride || '0')
      : cartSubtotal;
  const vat = Math.round(subtotal * (vatPercent / 100) * 100) / 100;
  const total = totalOverride !== null
    ? parseFloat(totalOverride || '0')
    : Math.round((subtotal + vat) * 100) / 100;

  // Delivery estimate: longest lead time (use custom override if set)
  const autoDeliveryEstimate = cart.length > 0
    ? (() => {
        let maxWeeks = 0;
        for (const item of cart) {
          const match = item.leadTime?.match(/(\d+)/);
          if (match) maxWeeks = Math.max(maxWeeks, parseInt(match[1]));
        }
        return maxWeeks > 0 ? `~ ${maxWeeks} weeks` : '~ 4 weeks';
      })()
    : null;
  const deliveryEstimate = customDelivery || autoDeliveryEstimate;

  const initials = customer
    ? customer.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || customer.email[0].toUpperCase()
    : '';

  // ── Customer Summary Bar (always visible on products/configurator screens) ──

  const [editingNameInline, setEditingNameInline] = useState(false);
  const [inlineFirstName, setInlineFirstName] = useState('');
  const [inlineLastName, setInlineLastName] = useState('');
  const [savingNameInline, setSavingNameInline] = useState(false);

  const startInlineNameEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!customer) return;
    const parts = customer.name.split(' ');
    setInlineFirstName(parts[0] || '');
    setInlineLastName(parts.slice(1).join(' ') || '');
    setEditingNameInline(true);
  };

  const saveInlineNameEdit = async () => {
    if (!customer || !selectedRegion) return;
    setSavingNameInline(true);
    const newName = `${inlineFirstName.trim()} ${inlineLastName.trim()}`.trim();

    // Check if this is a new customer (not yet in WooCommerce)
    const regionMatch = regions[selectedRegion];
    const isNewCustomer = !regionMatch?.found || !regionMatch?.wc_customer_id;

    if (isNewCustomer) {
      // Just update local state for new customers
      setCustomer((prev) => prev ? { ...prev, name: newName } : prev);
      setEditingNameInline(false);
      setSavingNameInline(false);
      return;
    }

    try {
      const res = await fetch(`/api/wc/customers?region=${selectedRegion}&email=${encodeURIComponent(customer.email)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: inlineFirstName.trim(),
          last_name: inlineLastName.trim(),
        }),
      });
      if (res.ok) {
        setCustomer((prev) => prev ? { ...prev, name: newName } : prev);
        // Update regions cache
        setRegions((prev) => ({
          ...prev,
          [selectedRegion]: prev[selectedRegion] ? { ...prev[selectedRegion], first_name: inlineFirstName.trim(), last_name: inlineLastName.trim() } : prev[selectedRegion],
        }));
      }
    } catch (err) {
      console.error('Failed to save name:', err);
    }
    setEditingNameInline(false);
    setSavingNameInline(false);
  };

  const CustomerSummaryBar = () => {
    if (!customer) return null;
    return (
      <div
        className="flex items-center gap-2.5 px-3 py-2 mb-3 rounded-lg bg-gray-50 border border-gray-200 cursor-pointer"
        onClick={() => {
          if (!editingCustomer && !editingNameInline) {
            setCustomerExpanded(!customerExpanded);
          }
        }}
      >
        <div className="w-7 h-7 rounded-full bg-[#e6faf3] flex items-center justify-center text-[#10c99e] font-[Jost,sans-serif] font-bold text-[11px] flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          {editingNameInline ? (
            <div className="flex gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={inlineFirstName}
                onChange={(e) => setInlineFirstName(e.target.value)}
                placeholder="First"
                className="w-20 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                autoFocus
              />
              <input
                type="text"
                value={inlineLastName}
                onChange={(e) => setInlineLastName(e.target.value)}
                placeholder="Last"
                className="w-20 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
              />
              <button
                onClick={(e) => { e.stopPropagation(); saveInlineNameEdit(); }}
                disabled={savingNameInline}
                className="p-0.5 text-[#10c99e] hover:bg-[#e6faf3] rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingNameInline(false); }}
                className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <div className="font-[Jost,sans-serif] text-[12px] font-semibold truncate">
                {customer.name || customer.email}
              </div>
              <button
                onClick={startInlineNameEdit}
                className="p-0.5 text-gray-300 hover:text-[#10c99e] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit name"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          )}
          {customer.company && !editingNameInline && (
            <div className="text-[10px] text-gray-400 truncate">{customer.company}</div>
          )}
        </div>
        {selectedRegion && !editingNameInline && (
          <span className="text-[10px] font-[Jost,sans-serif] font-semibold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
            {selectedRegion}
          </span>
        )}
        {cart.length > 0 && !editingNameInline && (
          <span className="text-[10px] font-[Jost,sans-serif] font-semibold text-[#10c99e] bg-[#e6faf3] px-1.5 py-0.5 rounded">
            {cart.length} item{cart.length !== 1 ? 's' : ''}
          </span>
        )}
        {!editingNameInline && <ChevronDown open={customerExpanded} />}
      </div>
    );
  };

  // Expanded customer details (shown below summary bar when expanded on products/configurator)
  const CustomerExpandedDetails = () => {
    if (!customer || !customerExpanded) return null;
    return (
      <div className="mb-3 px-3 pb-2 border border-gray-200 rounded-lg bg-white -mt-1 border-t-0 rounded-t-none">
        {editingCustomer ? (
          <div className="pt-2">
            <CustomerEditForm
              editFirstName={editFirstName}
              editLastName={editLastName}
              editCompany={editCompany}
              editPhone={editPhone}
              editVatNumber={editVatNumber}
              editCountry={editCountry}
              editAddress1={editAddress1}
              editAddress2={editAddress2}
              editCity={editCity}
              editPostcode={editPostcode}
              editNotes={editNotes}
              onFirstNameChange={setEditFirstName}
              onLastNameChange={setEditLastName}
              onCompanyChange={setEditCompany}
              onPhoneChange={setEditPhone}
              onVatNumberChange={setEditVatNumber}
              onCountryChange={setEditCountry}
              onAddress1Change={setEditAddress1}
              onAddress2Change={setEditAddress2}
              onCityChange={setEditCity}
              onPostcodeChange={setEditPostcode}
              countryOptions={countryOptions}
              onNotesChange={setEditNotes}
              onSave={(e) => { e.stopPropagation(); saveCustomerEdit(); }}
              onCancel={(e) => { e.stopPropagation(); { setEditingCustomer(false); editingCustomerRef.current = false; }; }}
              saving={savingCustomer}
            />
          </div>
        ) : (
          <CustomerDetails
            customer={customer}
            currencySymbol={currencySymbol}
            selectedRegion={selectedRegion}
            regions={regions}
            onEdit={(e) => { e.stopPropagation(); startEditCustomer(); }}
          />
        )}
      </div>
    );
  };

  // ── RENDER ─────────────────────────────────────────────────────────

  // Empty state
  if (screen.type === 'empty') {
    return (
      <div className="p-3">
        <Header mode={mode} onModeChange={setMode} />
        <div className="text-center py-8 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <p className="text-[13px]">Select a conversation to detect customer email</p>
          <button
            onClick={() => { setScreen({ type: 'main' }); setCustomerSearchMode(true); }}
            className="mt-3 text-[12px] font-[Jost,sans-serif] font-semibold text-[#10c99e] hover:text-[#0db88e] transition-colors"
          >
            Or search manually
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (screen.type === 'loading') {
    return (
      <div className="p-3">
        <Header mode={mode} onModeChange={setMode} />
        <div className="text-center py-8">
          <Spinner />
          <p className="text-[13px] text-gray-400 mt-3">Detecting customer...</p>
        </div>
      </div>
    );
  }

  // Pick email from multiple
  if (screen.type === 'pick-email') {
    return (
      <div className="p-3">
        <Header mode={mode} onModeChange={setMode} />
        <div className="font-[Jost,sans-serif] text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Select a customer
        </div>
        <div className="space-y-1">
          {screen.contacts.map((c) => (
            <button
              key={c.email}
              onClick={() => selectCustomerByEmail(c.email, c.name)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] hover:bg-gray-50 transition-colors cursor-pointer text-left"
            >
              <span>{c.name ? `${c.name} <${c.email}>` : c.email}</span>
              <span className="text-[#253461] font-semibold">&rsaquo;</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Product picker — customer summary always visible at top
  if (screen.type === 'products') {
    return (
      <div className="p-3">
        <Header mode={mode} onModeChange={setMode} />

        {/* Customer always at top */}
        <CustomerSummaryBar />
        <CustomerExpandedDetails />

        <button
          onClick={() => { setScreen({ type: 'main' }); setEditingCartItemId(null); }}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-[#253461] mb-3 cursor-pointer transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to cart
        </button>
        <SidebarProductList
          region={selectedRegion!}
          onSelectProduct={(id, name) =>
            setScreen({ type: 'configurator', productId: id, productName: name })
          }
        />
      </div>
    );
  }

  // Configurator — customer summary always visible at top
  if (screen.type === 'configurator') {
    return (
      <div className="p-3">
        <Header mode={mode} onModeChange={setMode} />

        {/* Customer always at top */}
        <CustomerSummaryBar />
        <CustomerExpandedDetails />

        <button
          onClick={() => { setScreen({ type: 'products' }); setEditingCartItemId(null); }}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-[#253461] mb-3 cursor-pointer transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to products
        </button>
        <SidebarConfigurator
          productId={screen.productId}
          productName={screen.productName}
          region={selectedRegion!}
          customerEmail={customer?.email}
          mode={mode}
          onAddToCart={handleAddToCart}
        />
      </div>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────

  return (
    <div className="p-3">
      <Header mode={mode} onModeChange={setMode} />

      {/* ── Customer Section ── */}
      <SectionHeader
        icon={<CustomerIcon />}
        title="Customer"
        action={
          customer && !customerSearchMode
            ? { label: 'Change', onClick: () => { setCustomerSearchMode(true); setSearchQuery(''); } }
            : undefined
        }
      />

      {customerSearchMode || !customer ? (
        /* Customer search */
        <div className="mb-4">
          {!showNewCustomerForm ? (
            <>
              <div className="flex gap-2 mb-2">
                <div className="flex-1 relative">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Search by name, email, company..."
                    className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => setShowNewCustomerForm(true)}
                  className="px-3 py-2 text-[12px] font-[Jost,sans-serif] font-semibold text-[#10c99e] border border-[#10c99e] rounded-lg hover:bg-[#e6faf3] transition-colors whitespace-nowrap"
                >
                  + New
                </button>
              </div>

              {/* Search results dropdown */}
              {searchFocused && searchQuery.length >= 2 && (
                <div className="border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                  {searchLoading ? (
                    <div className="flex items-center justify-center py-4"><Spinner /></div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-gray-400 text-center">No customers found</div>
                  ) : (
                    searchResults.map((r, i) => {
                      const name = [r.first_name, r.last_name].filter(Boolean).join(' ');
                      const ri = name ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) : r.email[0].toUpperCase();
                      return (
                        <button
                          key={`${r.email}-${r.region}-${i}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selectCustomerByEmail(r.email, name);
                            setCustomerSearchMode(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#e6faf3] flex items-center justify-center text-[#10c99e] font-[Jost,sans-serif] font-semibold text-[12px] flex-shrink-0">
                            {ri}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate">{name || r.email}</div>
                            <div className="text-[10px] text-gray-400 truncate">{name ? r.email : ''}{r.company ? ` · ${r.company}` : ''}</div>
                          </div>
                          <span className="text-[10px] text-gray-400">{r.region}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Cancel button if we have a customer */}
              {customer && (
                <button
                  onClick={() => setCustomerSearchMode(false)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 mt-1"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            /* New customer form */
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email *"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
                autoFocus
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
              />
              <input
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Company"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
              />
              <input
                type="text"
                value={newVatNumber}
                onChange={(e) => setNewVatNumber(e.target.value)}
                placeholder="VAT number (e.g. FR12345678901, DE123456789)"
                className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleNewCustomer}
                  disabled={!newEmail.trim() || creatingCustomer}
                  className="flex-1 py-2 text-[12px] font-[Jost,sans-serif] font-semibold bg-[#10c99e] text-white rounded-lg hover:bg-[#0db88e] disabled:bg-gray-300 transition-colors"
                >
                  {creatingCustomer ? 'Creating...' : 'Add Customer'}
                </button>
                <button
                  onClick={() => { setShowNewCustomerForm(false); if (!customer) setCustomerSearchMode(false); }}
                  className="px-3 py-2 text-[12px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Customer card */
        <div className="mb-4">
          <div
            className="border border-gray-200 rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-3 py-2.5 border-l-[3px] border-l-[#10c99e] cursor-pointer" onClick={() => { if (!editingNameInline) setCustomerExpanded(!customerExpanded); }}>
              <div className="w-9 h-9 rounded-full bg-[#e6faf3] flex items-center justify-center text-[#10c99e] font-[Jost,sans-serif] font-bold text-[13px] flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                {editingNameInline ? (
                  <div className="flex gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={inlineFirstName}
                      onChange={(e) => setInlineFirstName(e.target.value)}
                      placeholder="First"
                      className="w-20 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={inlineLastName}
                      onChange={(e) => setInlineLastName(e.target.value)}
                      placeholder="Last"
                      className="w-20 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); saveInlineNameEdit(); }}
                      disabled={savingNameInline}
                      className="p-0.5 text-[#10c99e] hover:bg-[#e6faf3] rounded"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingNameInline(false); }}
                      className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 group">
                    <div className="font-[Jost,sans-serif] text-[13px] font-semibold truncate">
                      {customer.name || customer.email}
                    </div>
                    <button
                      onClick={(e) => startInlineNameEdit(e)}
                      className="p-0.5 text-gray-300 hover:text-[#10c99e] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit name"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                {!editingNameInline && <div className="text-[11px] text-gray-400 truncate">{customer.email}</div>}
              </div>
              {!editingNameInline && <ChevronDown open={customerExpanded} />}
            </div>

            {customerExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                {editingCustomer ? (
                  <CustomerEditForm
                    editFirstName={editFirstName}
                    editLastName={editLastName}
                    editCompany={editCompany}
                    editPhone={editPhone}
                    editVatNumber={editVatNumber}
                    editCountry={editCountry}
                    editAddress1={editAddress1}
                    editAddress2={editAddress2}
                    editCity={editCity}
                    editPostcode={editPostcode}
                    editNotes={editNotes}
                    onFirstNameChange={setEditFirstName}
                    onLastNameChange={setEditLastName}
                    onCompanyChange={setEditCompany}
                    onPhoneChange={setEditPhone}
                    onVatNumberChange={setEditVatNumber}
                    onCountryChange={setEditCountry}
                    onAddress1Change={setEditAddress1}
                    onAddress2Change={setEditAddress2}
                    onCityChange={setEditCity}
                    onPostcodeChange={setEditPostcode}
                    countryOptions={countryOptions}
                    onNotesChange={setEditNotes}
                    onSave={(e) => { e.stopPropagation(); saveCustomerEdit(); }}
                    onCancel={(e) => { e.stopPropagation(); { setEditingCustomer(false); editingCustomerRef.current = false; }; }}
                    saving={savingCustomer}
                  />
                ) : (
                  <CustomerDetails
                    customer={customer}
                    currencySymbol={currencySymbol}
                    selectedRegion={selectedRegion}
                    regions={regions}
                    onEdit={(e) => { e.stopPropagation(); startEditCustomer(); }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Region Selector ── */}
      {customer && !customerSearchMode && (
        <div className="mb-4">
          {regionsLoading ? (
            <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-3">
              <Spinner /> Checking regions...
            </div>
          ) : (
            <div className="flex gap-1.5">
              {REGION_ORDER.map((code) => {
                const match = regions[code];
                const found = match?.found;
                const label = found && match.first_name
                  ? `${match.first_name}${match.last_name ? ' ' + match.last_name[0] + '.' : ''}`
                  : null;

                return (
                  <button
                    key={code}
                    onClick={() => handleRegionSelect(code)}
                    className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[11px] font-[Jost,sans-serif] font-medium border-2 transition-all ${
                      selectedRegion === code
                        ? 'border-[#10c99e] bg-[#e6faf3]'
                        : 'border-transparent bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${found ? 'bg-[#10c99e]' : 'bg-gray-300'}`} />
                      <span className="font-semibold">{code}</span>
                    </div>
                    {found && label ? (
                      <span className="text-[9px] text-gray-500 truncate max-w-full">{label}</span>
                    ) : (
                      <span className="text-[9px] text-gray-400">new</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Products Section ── */}
      {customer && !customerSearchMode && selectedRegion && (
        <>
          <SectionHeader
            icon={<ProductsIcon />}
            title="Products"
            action={{ label: '+ Add Product', onClick: handleProceedToProducts }}
          />

          {createRegionError && (
            <div className="mb-3 text-[12px] text-red-500 bg-red-50 rounded-md px-3 py-2">{createRegionError}</div>
          )}

          {cart.length === 0 ? (
            <div className="text-center py-6 mb-4">
              {submitResult && submitResult.success ? (
                <div
                  className="px-3 py-2.5 rounded-lg text-[12px] bg-[#e6faf3] text-[#0a7d5a] text-left mb-3"
                >
                  {mode === 'order' && submitResult.order_id ? (
                    <div>
                      Order{' '}
                      <a href={submitResult.order_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                        #{submitResult.order_number || submitResult.order_id}
                      </a>{' '}
                      created on {selectedRegion} site
                      {submitResult.order_status && <span> ({submitResult.order_status})</span>}
                    </div>
                  ) : (
                    <>
                      <div>Quote #{submitResult.quote_id} created!</div>
                      {submitResult.site_quote_id && (
                        <div className="mt-1">
                          Quote{' '}
                          <a href={submitResult.quote_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                            #{submitResult.site_quote_id}
                          </a>{' '}
                          on {selectedRegion} site
                          {submitResult.email_sent && ' — email sent'}
                          {submitResult.pdf_url && (
                            <>
                              {' — '}
                              <a href={submitResult.pdf_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                                PDF
                              </a>
                            </>
                          )}
                        </div>
                      )}
                      {submitResult.site_error && (
                        <div className="mt-1 text-amber-600">Site error: {submitResult.site_error}</div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-gray-300 mb-2 flex justify-center">
                    <ProductsIcon />
                  </div>
                  <p className="text-[12px] text-gray-400">
                    No products added yet.<br />
                    Click "+ Add Product" to start.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {cart.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  currency={currencySymbol}
                  onEdit={() => editItem(item)}
                  onUpdate={(updates) => updateItem(item.id, updates)}
                  onDuplicate={() => duplicateItem(item.id)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Summary Section ── */}
      {cart.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-2">
          <h3 className="font-[Jost,sans-serif] text-[12px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Summary
          </h3>

          <div className="space-y-2 mb-4">
            <SummaryRow label="Products" value={`${cart.length} item${cart.length !== 1 ? 's' : ''}`} />
            <Divider />
            <EditableSummaryRow label="Subtotal" value={subtotalOverride !== null && totalOverride === null ? subtotalOverride : subtotal.toFixed(2)} currencySymbol={currencySymbol} onChange={(v) => { setSubtotalOverride(v); setTotalOverride(null); }} />
            <SummaryRow label={isVatExempt ? 'VAT (Reverse Charge)' : `VAT (${vatPercent}%)`} value={`${currencySymbol}${vat.toFixed(2)}`} muted />
            <Divider />
            <EditableSummaryRow label="Total" value={totalOverride !== null ? totalOverride : total.toFixed(2)} currencySymbol={currencySymbol} onChange={(v) => { setTotalOverride(v); setSubtotalOverride(null); }} bold />
          </div>

          {/* Delivery estimate — hidden for manual quotes (meeting 2026-03-24) */}
          {false && (deliveryEstimate || cart.length > 0) && (
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg mb-3">
              <div className="flex items-center gap-1.5">
                <DeliveryIcon />
                <span className="text-[12px] text-gray-600 font-medium">Delivery</span>
              </div>
              {editingDelivery ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customDelivery || autoDeliveryEstimate || ''}
                    onChange={(e) => setCustomDelivery(e.target.value)}
                    onBlur={() => setEditingDelivery(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingDelivery(false); }}
                    autoFocus
                    className="w-24 text-right text-[12px] font-[Jost,sans-serif] font-semibold px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-[Jost,sans-serif] font-semibold">{deliveryEstimate || '~ 4 weeks'}</span>
                  <ClockIcon />
                  <button
                    onClick={() => setEditingDelivery(true)}
                    className="ml-1 p-0.5 text-gray-400 hover:text-[#10c99e] transition-colors"
                    title="Edit delivery estimate"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Customer type selection */}
          <div className="mb-3">
            <label className="text-[11px] font-[Jost,sans-serif] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Ordering as
            </label>
            <div className="flex gap-1">
              {(['individual', 'company', 'association'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setCustomerType(type)}
                  className={`flex-1 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold rounded-lg border transition-colors ${
                    customerType === type
                      ? 'bg-[#10c99e] text-white border-[#10c99e]'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Company / Association name */}
          {customerType !== 'individual' && (
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={customerType === 'company' ? 'Company name' : 'Association name'}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
            />
          )}

          {/* Country */}
          <select
            value={customer?.country || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, country: e.target.value } : prev)}
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
          >
            <option value="">Select country...</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>{COUNTRY_NAMES[c.code] || c.code} ({c.rate}%)</option>
            ))}
          </select>
          {vatRateLoading && (
            <div className="text-[10px] text-gray-400 mb-2">Loading tax rate...</div>
          )}

          {/* Customer name (editable) */}
          <div className="flex items-center justify-between text-[12px] border border-gray-200 rounded-lg px-3 py-2 mb-2">
            <span className="text-gray-400">Customer</span>
            {editingNameInline ? (
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={inlineFirstName}
                  onChange={(e) => setInlineFirstName(e.target.value)}
                  placeholder="First"
                  className="w-16 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                  autoFocus
                />
                <input
                  type="text"
                  value={inlineLastName}
                  onChange={(e) => setInlineLastName(e.target.value)}
                  placeholder="Last"
                  className="w-16 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]"
                />
                <button
                  onClick={() => saveInlineNameEdit()}
                  disabled={savingNameInline}
                  className="p-0.5 text-[#10c99e] hover:bg-[#e6faf3] rounded"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  onClick={() => setEditingNameInline(false)}
                  className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group">
                <span className="font-medium text-gray-700">{customer?.name || customer?.email || ''}</span>
                <button
                  onClick={(e) => startInlineNameEdit(e)}
                  className="p-0.5 text-gray-300 hover:text-[#10c99e] opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* VAT number — for both quotes and orders */}
          <input
            type="text"
            value={customer?.vatNumber || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, vatNumber: e.target.value } : prev)}
            placeholder="VAT number (e.g. DE123456789, FR12345678901)"
            className={`w-full px-3 py-2 text-[12px] border rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2 ${isVatExempt ? 'border-[#10c99e] bg-[#e6faf3]' : 'border-gray-200'}`}
          />

          {/* Postal address fields */}
          <input
            type="text"
            value={customer?.address1 || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, address1: e.target.value } : prev)}
            placeholder="Street address"
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
          />
          <input
            type="text"
            value={customer?.address2 || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, address2: e.target.value } : prev)}
            placeholder="Address line 2 (optional)"
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
          />
          <input
            type="text"
            value={customer?.city || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, city: e.target.value } : prev)}
            placeholder="City"
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
          />
          <input
            type="text"
            value={customer?.postcode || ''}
            onChange={(e) => setCustomer((prev) => prev ? { ...prev, postcode: e.target.value } : prev)}
            placeholder="Postcode"
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
          />

          {/* Payment method — only for orders */}
          {mode === 'order' && (
            <div className="mb-3">
              <label className="text-[11px] font-[Jost,sans-serif] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Payment method
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setPaymentMethod('bacs')}
                  className={`flex-1 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold rounded-lg border transition-colors ${
                    paymentMethod === 'bacs'
                      ? 'bg-[#10c99e] text-white border-[#10c99e]'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Bank Transfer
                </button>
                <button
                  onClick={() => setPaymentMethod('payment_link')}
                  className={`flex-1 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold rounded-lg border transition-colors ${
                    paymentMethod === 'payment_link'
                      ? 'bg-[#10c99e] text-white border-[#10c99e]'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Payment Link
                </button>
              </div>
            </div>
          )}

          {/* Quote name (quote mode only) */}
          {mode === 'quote' && (
            <input
              type="text"
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              placeholder={`Quote - ${new Date().toISOString().slice(0, 10)}`}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors mb-2"
            />
          )}

          {/* Design upload section — hidden for manual quotes (meeting 2026-03-24) */}
          <div className="border border-gray-200 rounded-lg p-3 mb-3 hidden">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={designRequested}
                onChange={(e) => setDesignRequested(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#10c99e]"
              />
              <span className="text-[12px] font-[Jost,sans-serif] font-semibold text-gray-700">
                I would like to receive a free digital design
              </span>
            </label>

            {designRequested && (
              <div className="mt-2.5 space-y-2">
                <p className="text-[11px] text-gray-400">
                  Give us as much information as possible, and we'll prepare a few designs for you.
                </p>
                <textarea
                  value={designMessage}
                  onChange={(e) => setDesignMessage(e.target.value)}
                  placeholder="Describe your design idea..."
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e] resize-none"
                />

                {/* File upload */}
                <div>
                  <input
                    ref={designFileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const maxSize = 20 * 1024 * 1024; // 20MB total
                      const totalSize = [...designFiles, ...files].reduce((s, f) => s + f.size, 0);
                      if (totalSize > maxSize) {
                        alert('Total file size exceeds 20MB limit');
                        return;
                      }
                      if (designFiles.length + files.length > 10) {
                        alert('Maximum 10 files allowed');
                        return;
                      }
                      setDesignFiles((prev) => [...prev, ...files]);
                      if (designFileInputRef.current) designFileInputRef.current.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => designFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload files
                  </button>
                  <span className="text-[10px] text-gray-400 ml-2">JPG, PNG, PDF — max 10 files, 20MB</span>
                </div>

                {/* File list */}
                {designFiles.length > 0 && (
                  <div className="space-y-1">
                    {designFiles.map((file, i) => (
                      <div key={`${file.name}-${i}`} className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded text-[11px]">
                        <span className="truncate flex-1 text-gray-600">{file.name}</span>
                        <button
                          onClick={() => setDesignFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-2 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Internal note */}
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Add internal note..."
            rows={2}
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors resize-none mb-3"
          />

          {/* Submit buttons */}
          <button
            disabled={submitting || vatRateLoading}
            onClick={() => handleSubmit(false)}
            className="w-full py-2.5 rounded-lg bg-[#10c99e] hover:bg-[#0db88e] disabled:bg-gray-300 text-white font-[Jost,sans-serif] font-semibold text-[13px] transition-colors mb-2"
          >
            {vatRateLoading ? 'Updating tax rate...' : creatingRegionUser ? 'Setting up customer...' : submitting ? 'Creating...' : `Create ${mode === 'quote' ? 'Quote' : 'Order'}`}
          </button>

          {mode === 'quote' && (
            <button
              disabled={submitting || vatRateLoading}
              onClick={() => handleSubmit(true)}
              className="w-full py-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-[#253461] font-[Jost,sans-serif] font-semibold text-[13px] transition-colors"
            >
              Preview & Send
            </button>
          )}

          {/* Submit result */}
          {submitResult && (
            <div
              className={`mt-3 px-3 py-2.5 rounded-lg text-[12px] ${
                submitResult.success ? 'bg-[#e6faf3] text-[#0a7d5a]' : 'bg-red-50 text-red-500'
              }`}
            >
              {submitResult.success ? (
                mode === 'order' && submitResult.order_id ? (
                  <div>
                    Order{' '}
                    <a href={submitResult.order_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                      #{submitResult.order_number || submitResult.order_id}
                    </a>{' '}
                    created on {selectedRegion} site
                    {submitResult.order_status && <span> ({submitResult.order_status})</span>}
                    {submitResult.payment_url && (
                      <div className="mt-1">
                        <a href={submitResult.payment_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                          Payment link
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>Quote #{submitResult.quote_id} created!</div>
                    {submitResult.site_quote_id && (
                      <div className="mt-1">
                        Quote{' '}
                        <a href={submitResult.quote_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                          #{submitResult.site_quote_id}
                        </a>{' '}
                        on {selectedRegion} site
                        {submitResult.email_sent && ' — email sent'}
                        {submitResult.pdf_url && (
                          <>
                            {' — '}
                            <a href={submitResult.pdf_url} target="_blank" rel="noopener" className="text-[#253461] underline">
                              PDF
                            </a>
                          </>
                        )}
                      </div>
                    )}
                    {submitResult.site_error && (
                      <div className="mt-1 text-amber-600">Site error: {submitResult.site_error}</div>
                    )}
                  </>
                )
              ) : (
                `Error: ${submitResult.error}`
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function Header({ mode, onModeChange }: { mode: 'quote' | 'order'; onModeChange: (m: 'quote' | 'order') => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="font-[Jost,sans-serif] text-[15px] font-semibold text-[#253461]">
        Create {mode === 'quote' ? 'Quote' : 'Order'}
      </h1>
      <div className="flex items-center bg-gray-100 rounded-full p-0.5">
        <button
          onClick={() => onModeChange('quote')}
          className={`px-3 py-1 rounded-full text-[11px] font-[Jost,sans-serif] font-semibold transition-all ${
            mode === 'quote' ? 'bg-[#10c99e] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Quote
        </button>
        <button
          onClick={() => onModeChange('order')}
          className={`px-3 py-1 rounded-full text-[11px] font-[Jost,sans-serif] font-semibold transition-all ${
            mode === 'order' ? 'bg-[#10c99e] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Order
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[#253461]">
        {icon}
        <span className="font-[Jost,sans-serif] text-[12px] font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {action && (
        <button onClick={action.onClick} className="text-[11px] font-[Jost,sans-serif] font-semibold text-[#10c99e] hover:text-[#0db88e] transition-colors">
          {action.label}
        </button>
      )}
    </div>
  );
}

function ProductCard({
  item,
  currency,
  onEdit,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  item: CartItem;
  currency: string;
  onEdit: () => void;
  onUpdate: (updates: { quantity: number; pricePerPiece: number }) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingQty, setEditingQty] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [tempQty, setTempQty] = useState(String(item.quantity));
  const [tempPrice, setTempPrice] = useState(item.pricePerPiece.toFixed(2));

  const selectionsStr = Object.entries(item.selections)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  const commitQty = () => {
    const parsed = parseInt(tempQty, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdate({ quantity: parsed, pricePerPiece: item.pricePerPiece });
    } else {
      setTempQty(String(item.quantity));
    }
    setEditingQty(false);
  };

  const commitPrice = () => {
    const parsed = parseFloat(tempPrice);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdate({ quantity: item.quantity, pricePerPiece: parsed });
    } else {
      setTempPrice(item.pricePerPiece.toFixed(2));
    }
    setEditingPrice(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-[Jost,sans-serif] text-[13px] font-semibold truncate">{item.productName}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-[Jost,sans-serif] text-[13px] font-bold">
            {currency}{item.lineTotal.toFixed(2)}
          </div>
        </div>
        <ChevronDown open={expanded} />
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 border-t border-gray-100">
          <p className="text-[11px] text-gray-500 mt-2 mb-2 leading-relaxed">{selectionsStr}</p>
          <div className="flex items-center justify-between text-[11px] mb-2.5">
            {editingQty ? (
              <span className="text-gray-600 flex items-center gap-1">
                Qty:{' '}
                <input
                  type="number"
                  min="1"
                  value={tempQty}
                  onChange={(e) => setTempQty(e.target.value)}
                  onBlur={commitQty}
                  onKeyDown={(e) => e.key === 'Enter' && commitQty()}
                  autoFocus
                  className="w-14 px-1 py-0.5 border border-blue-300 rounded text-[11px] font-bold text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-gray-400">pcs</span>
              </span>
            ) : (
              <span
                className="text-gray-600 cursor-pointer hover:text-blue-600 group"
                onClick={(e) => { e.stopPropagation(); setTempQty(String(item.quantity)); setEditingQty(true); }}
              >
                Qty: <strong className="group-hover:underline">{item.quantity} pcs</strong>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 inline ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </span>
            )}
            {editingPrice ? (
              <span className="text-gray-500 flex items-center gap-1">
                {currency}
                <input
                  type="text"
                  value={tempPrice}
                  onChange={(e) => setTempPrice(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={(e) => e.key === 'Enter' && commitPrice()}
                  autoFocus
                  className="w-16 px-1 py-0.5 border border-blue-300 rounded text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-gray-400">/ pc</span>
              </span>
            ) : (
              <span
                className="text-gray-500 cursor-pointer hover:text-blue-600 group"
                onClick={(e) => { e.stopPropagation(); setTempPrice(item.pricePerPiece.toFixed(2)); setEditingPrice(true); }}
              >
                <span className="group-hover:underline">{currency}{item.pricePerPiece.toFixed(2)} / pc</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5 inline ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 border-t border-gray-100 pt-2">
            <ActionButton icon="edit" label="Edit" onClick={onEdit} />
            <ActionButton icon="duplicate" label="Duplicate" onClick={onDuplicate} />
            <ActionButton icon="remove" label="Remove" onClick={onRemove} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const iconSvg =
    icon === 'edit' ? (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ) : icon === 'duplicate' ? (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    );

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
        danger ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-[#253461] hover:bg-gray-100'
      }`}
    >
      {iconSvg}
      {label}
    </button>
  );
}

function SummaryRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] ${bold ? 'font-[Jost,sans-serif] font-bold text-[#253461]' : muted ? 'text-gray-400' : 'text-gray-600'}`}>
        {label}
      </span>
      <span className={`text-[12px] font-[Jost,sans-serif] ${bold ? 'font-bold text-[16px] text-[#253461]' : muted ? 'text-gray-400' : 'font-semibold'}`}>
        {value}
      </span>
    </div>
  );
}

function EditableSummaryRow({ label, value, currencySymbol, onChange, bold, muted }: { label: string; value: string; currencySymbol: string; onChange: (v: string) => void; bold?: boolean; muted?: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] ${bold ? 'font-[Jost,sans-serif] font-bold text-[#253461]' : muted ? 'text-gray-400' : 'text-gray-600'}`}>
        {label}
      </span>
      {editing ? (
        <div className="flex items-center gap-1">
          <span className={`text-[12px] ${muted ? 'text-gray-400' : ''}`}>{currencySymbol}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
            autoFocus
            className={`w-20 text-right text-[12px] font-[Jost,sans-serif] ${bold ? 'font-bold' : 'font-semibold'} px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none focus:border-[#10c99e]`}
          />
        </div>
      ) : (
        <span
          onClick={() => setEditing(true)}
          title="Click to edit"
          className={`text-[12px] font-[Jost,sans-serif] cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 ${bold ? 'font-bold text-[16px] text-[#253461]' : muted ? 'text-gray-400' : 'font-semibold'}`}
        >
          {currencySymbol}{value}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100 my-1" />;
}

function CustomerDetails({
  customer,
  currencySymbol,
  selectedRegion,
  regions,
  onEdit,
}: {
  customer: { email: string; name: string; company: string; phone: string; vatNumber: string; customerType: string; country: string; address1: string; address2: string; city: string; postcode: string; notes: string; ordersCount: number; totalSpent: string };
  currencySymbol: string;
  selectedRegion: string | null;
  regions: Record<string, RegionMatch>;
  onEdit: (e: React.MouseEvent) => void;
}) {
  // Find first region with a WC ID for the "View in WP" link
  const viewRegion = selectedRegion && regions[selectedRegion]?.wc_customer_id
    ? selectedRegion
    : REGION_ORDER.find((c) => regions[c]?.found && regions[c]?.wc_customer_id) || null;

  const hasAnyRegion = REGION_ORDER.some((c) => regions[c]?.found && regions[c]?.wc_customer_id);
  const isOrg = customer.customerType === 'organization';

  return (
    <>
      {/* Customer type badge */}
      <div className="flex items-center gap-2 pt-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[Jost,sans-serif] font-semibold ${
          isOrg ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
        }`}>
          {isOrg ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
          {isOrg ? 'Organization' : 'Individual'}
        </span>
      </div>

      <div className="space-y-1.5 mb-2.5">
        {/* Email */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />}
          value={customer.email}
        />
        {/* Company */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />}
          value={customer.company}
          placeholder="No company"
        />
        {/* Phone */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />}
          value={customer.phone}
          placeholder="No phone"
        />
        {/* VAT Number */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />}
          value={customer.vatNumber}
          placeholder="No VAT number"
        />
        {/* Country */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
          value={customer.country ? (COUNTRY_NAMES[customer.country] || customer.country) : ''}
          placeholder="No country"
        />
        {/* Orders */}
        <DetailRow
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />}
          value={customer.ordersCount > 0
            ? `${customer.ordersCount} order${customer.ordersCount !== 1 ? 's' : ''} · ${currencySymbol}${customer.totalSpent} spent`
            : ''
          }
          placeholder="No orders yet"
        />
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="mb-2.5 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-[10px] font-[Jost,sans-serif] font-semibold text-amber-600 uppercase mb-0.5">Notes</div>
          <div className="text-[11px] text-amber-800 whitespace-pre-wrap">{customer.notes}</div>
        </div>
      )}

      <div className="flex gap-2">
        {hasAnyRegion && (
          <button
            onClick={onEdit}
            className="flex-1 px-3 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold text-[#10c99e] border border-[#10c99e] rounded-lg hover:bg-[#e6faf3] transition-colors"
          >
            Edit
          </button>
        )}
        {viewRegion && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const store = viewRegion === 'UK' ? 'hercules-merchandise.co.uk' : viewRegion === 'FR' ? 'hercules-merchandising.fr' : 'hercules-merchandise.de';
              window.open(`https://${store}/wp-admin/user-edit.php?user_id=${regions[viewRegion].wc_customer_id}`, '_blank');
            }}
            className="flex-1 px-3 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold text-[#253461] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View in WP
          </button>
        )}
      </div>
    </>
  );
}

function DetailRow({ icon, value, placeholder }: { icon: React.ReactNode; value: string; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {icon}
      </svg>
      <span className={value ? 'text-gray-500' : 'text-gray-300 italic'}>{value || placeholder || ''}</span>
    </div>
  );
}

function CustomerEditForm({
  editFirstName,
  editLastName,
  editCompany,
  editPhone,
  editVatNumber,
  editCountry,
  editAddress1,
  editAddress2,
  editCity,
  editPostcode,
  editNotes,
  countryOptions: formCountryOptions,
  onFirstNameChange,
  onLastNameChange,
  onCompanyChange,
  onPhoneChange,
  onVatNumberChange,
  onCountryChange,
  onAddress1Change,
  onAddress2Change,
  onCityChange,
  onPostcodeChange,
  onNotesChange,
  onSave,
  onCancel,
  saving,
}: {
  editFirstName: string;
  editLastName: string;
  editCompany: string;
  editPhone: string;
  editVatNumber: string;
  editCountry?: string;
  editAddress1?: string;
  editAddress2?: string;
  editCity?: string;
  editPostcode?: string;
  editNotes: string;
  countryOptions?: { code: string; rate: number }[];
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onCompanyChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onVatNumberChange: (v: string) => void;
  onCountryChange?: (v: string) => void;
  onAddress1Change?: (v: string) => void;
  onAddress2Change?: (v: string) => void;
  onCityChange?: (v: string) => void;
  onPostcodeChange?: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSave: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2 pt-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        <input
          type="text"
          value={editFirstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          placeholder="First name"
          className="flex-1 px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
        />
        <input
          type="text"
          value={editLastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          placeholder="Last name"
          className="flex-1 px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
        />
      </div>
      <input
        type="text"
        value={editCompany}
        onChange={(e) => onCompanyChange(e.target.value)}
        placeholder="Company"
        className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
      />
      <input
        type="tel"
        value={editPhone}
        onChange={(e) => onPhoneChange(e.target.value)}
        placeholder="Phone"
        className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
      />
      <input
        type="text"
        value={editVatNumber}
        onChange={(e) => onVatNumberChange(e.target.value)}
        placeholder="VAT number (e.g. FR12345678901, DE123456789)"
        className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
      />
      {onCountryChange && formCountryOptions && formCountryOptions.length > 0 && (
        <select
          value={editCountry || ''}
          onChange={(e) => onCountryChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e] bg-white"
        >
          <option value="">Select country...</option>
          {formCountryOptions.map((c) => (
            <option key={c.code} value={c.code}>{COUNTRY_NAMES[c.code] || c.code} ({c.rate}%)</option>
          ))}
        </select>
      )}
      {onAddress1Change && (
        <>
          <input
            type="text"
            value={editAddress1 || ''}
            onChange={(e) => onAddress1Change(e.target.value)}
            placeholder="Street address"
            className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
          />
          {onAddress2Change && (
            <input
              type="text"
              value={editAddress2 || ''}
              onChange={(e) => onAddress2Change(e.target.value)}
              placeholder="Address line 2 (optional)"
              className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
            />
          )}
          {onCityChange && (
            <input
              type="text"
              value={editCity || ''}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="City"
              className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e] mb-2"
            />
          )}
          {onPostcodeChange && (
            <input
              type="text"
              value={editPostcode || ''}
              onChange={(e) => onPostcodeChange(e.target.value)}
              placeholder="Postcode"
              className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e]"
            />
          )}
        </>
      )}
      <textarea
        value={editNotes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Internal notes about this customer..."
        rows={3}
        className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#10c99e] resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold bg-[#10c99e] text-white rounded-lg hover:bg-[#0db88e] disabled:bg-gray-300 transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[11px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
