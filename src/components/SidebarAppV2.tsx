import { useState } from 'react';

// ── Mock data for design ──────────────────────────────────────────────

const MOCK_CUSTOMER = {
  name: 'Stewart Randall',
  email: 'stewart@randalphotography.co.uk',
  company: 'Randal Photography',
  ordersCount: 3,
  totalSpent: '£2,480',
};

const MOCK_CART = [
  {
    id: '1',
    productName: 'Custom Cap',
    selections: { Front: '2D Embroidery (55mm)', Back: 'None', Side: 'None' },
    quantity: 200,
    pricePerPiece: 5.19,
    lineTotal: 1038.0,
    currencySymbol: '£',
  },
  {
    id: '2',
    productName: 'Woven Scarf',
    selections: { Format: '140x18 cm', Colours: '1-5 Colours' },
    quantity: 50,
    pricePerPiece: 7.6,
    lineTotal: 380.0,
    currencySymbol: '£',
  },
];

const REGIONS = [
  { code: 'DE', name: 'Germany', found: true, label: 'Hans M.' },
  { code: 'UK', name: 'United Kingdom', found: true, label: 'Stewart Randall' },
  { code: 'FR', name: 'France', found: false, label: null },
];

// ── Icons ─────────────────────────────────────────────────────────────

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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
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

// ── Main Component ────────────────────────────────────────────────────

export default function SidebarAppV2() {
  const [mode, setMode] = useState<'quote' | 'order'>('quote');
  const [selectedRegion, setSelectedRegion] = useState('UK');
  const [customerExpanded, setCustomerExpanded] = useState(true);
  const [internalNote, setInternalNote] = useState('');
  const [customerSearchFocused, setCustomerSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Whether customer is "selected" (for design, always true after region pick)
  const [hasCustomer, setHasCustomer] = useState(true);
  const [cart, setCart] = useState(MOCK_CART);

  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const vatPercent = selectedRegion === 'DE' ? 19 : 20;
  const vat = Math.round(subtotal * (vatPercent / 100) * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;
  const currency = selectedRegion === 'UK' ? '£' : '€';

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));
  const duplicateItem = (id: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: String(Date.now()) };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  return (
    <div className="p-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-[Jost,sans-serif] text-[15px] font-semibold text-[#253461]">
          Create {mode === 'quote' ? 'Quote' : 'Order'}
        </h1>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-full p-0.5">
            <button
              onClick={() => setMode('quote')}
              className={`px-3 py-1 rounded-full text-[11px] font-[Jost,sans-serif] font-semibold transition-all ${
                mode === 'quote'
                  ? 'bg-[#10c99e] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Quote
            </button>
            <button
              onClick={() => setMode('order')}
              className={`px-3 py-1 rounded-full text-[11px] font-[Jost,sans-serif] font-semibold transition-all ${
                mode === 'order'
                  ? 'bg-[#253461] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Order
            </button>
          </div>
        </div>
      </div>

      {/* ── Customer Section ── */}
      <SectionHeader
        icon={<CustomerIcon />}
        title="Customer"
        action={
          hasCustomer
            ? { label: 'Change', onClick: () => setHasCustomer(false) }
            : undefined
        }
      />

      {!hasCustomer ? (
        /* Customer search */
        <div className="mb-4">
          <div className="flex gap-2 mb-2">
            <div className="flex-1 relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setCustomerSearchFocused(true)}
                onBlur={() => setTimeout(() => setCustomerSearchFocused(false), 150)}
                placeholder="Search by name, email, company..."
                className="w-full pl-8 pr-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors"
              />
            </div>
            <button className="px-3 py-2 text-[12px] font-[Jost,sans-serif] font-semibold text-[#10c99e] border border-[#10c99e] rounded-lg hover:bg-[#e6faf3] transition-colors whitespace-nowrap">
              + New
            </button>
          </div>

          {/* Search results dropdown (mock) */}
          {customerSearchFocused && searchQuery.length > 0 && (
            <div className="border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
              <button
                onClick={() => { setHasCustomer(true); setSearchQuery(''); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-[#e6faf3] flex items-center justify-center text-[#10c99e] font-[Jost,sans-serif] font-semibold text-[12px] flex-shrink-0">
                  SR
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{MOCK_CUSTOMER.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{MOCK_CUSTOMER.email}</div>
                </div>
                <span className="text-[10px] text-gray-400">UK</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Customer card */
        <div className="mb-4">
          <div
            className="border border-gray-200 rounded-xl overflow-hidden cursor-pointer"
            onClick={() => setCustomerExpanded(!customerExpanded)}
          >
            {/* Card header - always visible */}
            <div className="flex items-center gap-3 px-3 py-2.5 border-l-[3px] border-l-[#10c99e]">
              <div className="w-9 h-9 rounded-full bg-[#e6faf3] flex items-center justify-center text-[#10c99e] font-[Jost,sans-serif] font-bold text-[13px] flex-shrink-0">
                SR
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-[Jost,sans-serif] text-[13px] font-semibold truncate">
                  {MOCK_CUSTOMER.name}
                </div>
                <div className="text-[11px] text-gray-400 truncate">
                  {MOCK_CUSTOMER.email}
                </div>
              </div>
              <ChevronDown open={customerExpanded} />
            </div>

            {/* Expanded details */}
            {customerExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2.5">
                  <span>{MOCK_CUSTOMER.company}</span>
                  <span className="text-gray-400">
                    Orders: {MOCK_CUSTOMER.ordersCount} &middot; {MOCK_CUSTOMER.totalSpent} spent
                  </span>
                </div>
                <button className="w-full px-3 py-1.5 text-[11px] font-[Jost,sans-serif] font-semibold text-[#253461] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  View Customer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Region Selector ── */}
      {hasCustomer && (
        <div className="mb-4">
          <div className="flex gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.code}
                onClick={() => setSelectedRegion(r.code)}
                className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[11px] font-[Jost,sans-serif] font-medium border-2 transition-all ${
                  selectedRegion === r.code
                    ? 'border-[#10c99e] bg-[#e6faf3]'
                    : 'border-transparent bg-gray-50 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${r.found ? 'bg-[#10c99e]' : 'bg-gray-300'}`}
                  />
                  <span className="font-semibold">{r.code}</span>
                </div>
                {r.found && r.label ? (
                  <span className="text-[9px] text-gray-500 truncate max-w-full">{r.label}</span>
                ) : (
                  <span className="text-[9px] text-gray-400">new</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Products Section ── */}
      {hasCustomer && selectedRegion && (
        <>
          <SectionHeader
            icon={<ProductsIcon />}
            title="Products"
            action={{
              label: '+ Add Product',
              onClick: () => {
                /* will navigate to product picker */
              },
            }}
          />

          {cart.length === 0 ? (
            <div className="text-center py-6 mb-4">
              <div className="text-gray-300 mb-2">
                <ProductsIcon />
              </div>
              <p className="text-[12px] text-gray-400">
                No products added yet.
                <br />
                Click "+ Add Product" to start.
              </p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {cart.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onEdit={() => {
                    /* will navigate to configurator */
                  }}
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
            <SummaryRow label="Customer" value={MOCK_CUSTOMER.name} />
            <SummaryRow label="Products" value={`${cart.length} item${cart.length !== 1 ? 's' : ''}`} />
            <Divider />
            <SummaryRow label="Subtotal" value={`${currency}${subtotal.toFixed(2)}`} />
            <SummaryRow
              label={`VAT (${vatPercent}%)`}
              value={`${currency}${vat.toFixed(2)}`}
              muted
            />
            <Divider />
            <SummaryRow
              label="Total"
              value={`${currency}${total.toFixed(2)}`}
              bold
            />
          </div>

          {/* Delivery estimate */}
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg mb-3">
            <div className="flex items-center gap-1.5">
              <DeliveryIcon />
              <span className="text-[12px] text-gray-600 font-medium">Delivery</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-[Jost,sans-serif] font-semibold">~ 4 weeks</span>
              <ClockIcon />
            </div>
          </div>

          {/* Internal note */}
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Add internal note..."
            rows={2}
            className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#10c99e] transition-colors resize-none mb-3"
          />

          {/* Create button */}
          <button className="w-full py-2.5 rounded-lg bg-[#10c99e] hover:bg-[#0db88e] text-white font-[Jost,sans-serif] font-semibold text-[13px] transition-colors mb-2">
            Create {mode === 'quote' ? 'Quote' : 'Order'} #Q-2026-0142
          </button>

          {/* Preview button */}
          <button className="w-full py-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-[#253461] font-[Jost,sans-serif] font-semibold text-[13px] transition-colors">
            Preview & Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

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
        <span className="font-[Jost,sans-serif] text-[12px] font-semibold uppercase tracking-wider">
          {title}
        </span>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-[11px] font-[Jost,sans-serif] font-semibold text-[#10c99e] hover:text-[#0db88e] transition-colors"
        >
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
  onDuplicate,
  onRemove,
}: {
  item: (typeof MOCK_CART)[0];
  currency: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const selectionsStr = Object.entries(item.selections)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Product header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-[Jost,sans-serif] text-[13px] font-semibold truncate">
            {item.productName}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-[Jost,sans-serif] text-[13px] font-bold">
            {currency}{item.lineTotal.toFixed(2)}
          </div>
        </div>
        <ChevronDown open={expanded} />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-gray-100">
          {/* Config summary */}
          <p className="text-[11px] text-gray-500 mt-2 mb-2 leading-relaxed">
            {selectionsStr}
          </p>

          {/* Quantity & price row */}
          <div className="flex items-center justify-between text-[11px] mb-2.5">
            <span className="text-gray-600">
              Qty: <strong>{item.quantity} pcs</strong>
            </span>
            <span className="text-gray-500">
              {currency}{item.pricePerPiece.toFixed(2)} / pc
            </span>
          </div>

          {/* Action buttons */}
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
        danger
          ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-[#253461] hover:bg-gray-100'
      }`}
    >
      {iconSvg}
      {label}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-[12px] ${bold ? 'font-[Jost,sans-serif] font-bold text-[#253461]' : muted ? 'text-gray-400' : 'text-gray-600'}`}
      >
        {label}
      </span>
      <span
        className={`text-[12px] font-[Jost,sans-serif] ${bold ? 'font-bold text-[16px] text-[#253461]' : muted ? 'text-gray-400' : 'font-semibold'}`}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100 my-1" />;
}
