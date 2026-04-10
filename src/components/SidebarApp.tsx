import { useState, useEffect, useCallback } from 'react';
import SidebarProductList from './SidebarProductList';
import SidebarConfigurator from './SidebarConfigurator';

declare const Missive: any;

interface Contact {
  email: string;
  name: string;
}

interface RegionMatch {
  found: boolean;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
}

type Screen =
  | { type: 'empty' }
  | { type: 'loading' }
  | { type: 'customer'; email: string; name: string }
  | { type: 'pick-email'; contacts: Contact[] }
  | { type: 'products'; email: string; region: string }
  | { type: 'configurator'; email: string; region: string; productId: number; productName: string };

const REGION_NAMES: Record<string, string> = {
  DE: 'Germany',
  UK: 'United Kingdom',
  FR: 'France',
};
const REGION_ORDER = ['DE', 'UK', 'FR'];
const INTERNAL_DOMAINS = [
  '@hercules-merchandise.com',
  '@hercules-merchandise.de',
  '@hercules-merchandise.co.uk',
  '@hercules-merchandising.fr',
  '@missiveapp.com',
];

export default function SidebarApp() {
  const [mode, setMode] = useState<'quote' | 'order'>('quote');
  const [screen, setScreen] = useState<Screen>({ type: 'empty' });
  const [regions, setRegions] = useState<Record<string, RegionMatch>>({});
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Missive integration
  useEffect(() => {
    if (typeof Missive === 'undefined') return;

    function isExternal(address: string) {
      const lower = address.toLowerCase();
      return !INTERNAL_DOMAINS.some((d) => lower.endsWith(d));
    }

    function handleConversations(conversations: any[]) {
      if (!conversations || conversations.length === 0) {
        setScreen({ type: 'empty' });
        return;
      }

      const addressFields = Missive.getEmailAddresses(conversations);
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
        setScreen({ type: 'customer', email: contacts[0].email, name: contacts[0].name });
        setSelectedRegion(null);
        setRegions({});
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
        setScreen({ type: 'loading' });
        Missive.fetchConversations(ids).then(handleConversations);
      },
      { retroactive: true }
    );
  }, []);

  // Fetch regions when customer screen appears
  useEffect(() => {
    if (screen.type !== 'customer') return;
    setRegionsLoading(true);
    fetch(`/api/wc/customers?email=${encodeURIComponent(screen.email)}`)
      .then((r) => r.json())
      .then((data) => {
        const regs = data.regions || {};
        setRegions(regs);
        setSelectedRegion(null);
      })
      .catch(() => setRegions({}))
      .finally(() => setRegionsLoading(false));
  }, [screen.type === 'customer' ? (screen as any).email : null]);

  const pickEmail = (contact: Contact) => {
    setScreen({ type: 'customer', email: contact.email, name: contact.name });
    setSelectedRegion(null);
    setRegions({});
  };

  // Go back to customer screen from products/configurator
  const goBackToCustomer = () => {
    if (screen.type === 'products' || screen.type === 'configurator') {
      setScreen({ type: 'customer', email: screen.email, name: '' });
    }
  };

  // === RENDER ===

  // Empty state
  if (screen.type === 'empty') {
    return (
      <div className="p-4">
        <Header mode={mode} onModeChange={setMode} />
        <div className="text-center py-8 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <p className="text-[13px]">Select a conversation to detect customer email</p>
        </div>
      </div>
    );
  }

  // Loading
  if (screen.type === 'loading') {
    return (
      <div className="p-4">
        <Header mode={mode} onModeChange={setMode} />
        <div className="text-center py-8">
          <Spinner />
          <p className="text-[13px] text-gray-400 mt-3">Detecting customer...</p>
        </div>
      </div>
    );
  }

  // Multiple emails — pick one
  if (screen.type === 'pick-email') {
    return (
      <div className="p-4">
        <Header mode={mode} onModeChange={setMode} />
        <Label>Select a customer</Label>
        <div className="space-y-1">
          {screen.contacts.map((c) => (
            <button
              key={c.email}
              onClick={() => pickEmail(c)}
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

  // Product catalog
  if (screen.type === 'products') {
    return (
      <div className="p-4">
        <Header mode={mode} onModeChange={setMode} />
        <button onClick={goBackToCustomer} className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-[#253461] mb-3 cursor-pointer transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <SidebarProductList
          region={screen.region}
          onSelectProduct={(id, name) =>
            setScreen({ type: 'configurator', email: screen.email, region: screen.region, productId: id, productName: name })
          }
        />
      </div>
    );
  }

  // Product configurator
  if (screen.type === 'configurator') {
    return (
      <div className="p-4">
        <Header mode={mode} onModeChange={setMode} />
        <button
          onClick={() => setScreen({ type: 'products', email: screen.email, region: screen.region })}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-[#253461] mb-3 cursor-pointer transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to products
        </button>
        <SidebarConfigurator productId={screen.productId} productName={screen.productName} region={screen.region} customerEmail={screen.email} mode={mode} />
      </div>
    );
  }

  // Customer detected
  return (
    <div className="p-4">
      <Header mode={mode} onModeChange={setMode} />
      <Label>Customer detected</Label>

      {/* Customer card */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4 border-l-3 border-l-[#253461]">
        <div className="font-[Jost,sans-serif] text-[14px] font-semibold break-all">{screen.email}</div>
        {screen.name && <div className="text-[13px] text-gray-500">{screen.name}</div>}
      </div>

      {/* Region selector */}
      {regionsLoading ? (
        <p className="text-[11px] text-gray-400 mb-3">Checking regions...</p>
      ) : (
        <>
          <Label>Select region for quotation</Label>
          <div className="space-y-1.5 mb-4">
            {REGION_ORDER.map((code) => {
              const match = regions[code];
              const found = match?.found;
              const nameLabel = found && match.first_name
                ? ` — ${match.first_name}${match.last_name ? ' ' + match.last_name : ''}${match.company ? ' (' + match.company + ')' : ''}`
                : '';
              return (
                <button
                  key={code}
                  onClick={() => setSelectedRegion(code)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-[Jost,sans-serif] font-medium border-2 transition-all cursor-pointer ${
                    selectedRegion === code
                      ? 'border-[#10c99e] bg-[#e6faf3]'
                      : 'border-transparent bg-gray-50 hover:border-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${found ? 'bg-[#10c99e]' : 'bg-gray-300'}`} />
                  <span className="flex-1 text-left">
                    <span className="font-semibold">{code}</span>
                    <span className="text-gray-500"> — {REGION_NAMES[code]}</span>
                    {nameLabel && <span className="text-[#0a7d5a] text-[11px]">{nameLabel}</span>}
                    {!found && <span className="text-gray-400 text-[11px]"> (new customer)</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Proceed to products (virtual — no WC customer creation yet) */}
      <button
        disabled={!selectedRegion}
        onClick={() => {
          if (!selectedRegion) return;
          setScreen({ type: 'products', email: screen.email, region: selectedRegion });
        }}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-[Jost,sans-serif] font-semibold text-white transition-all cursor-pointer ${
          selectedRegion
            ? 'bg-[#10c99e] hover:bg-[#0db88e]'
            : 'bg-gray-300 cursor-not-allowed'
        }`}
      >
        {mode === 'order' ? 'Create Order' : 'Create Quotation'}
      </button>
    </div>
  );
}

// --- Shared sub-components ---

function Header({ mode, onModeChange }: { mode: 'quote' | 'order'; onModeChange: (m: 'quote' | 'order') => void }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#469ADC] rounded-md flex items-center justify-center text-white font-bold text-[15px] font-[Jost,sans-serif] flex-shrink-0">
            H
          </div>
          <span className="font-[Jost,sans-serif] text-[15px] font-semibold text-[#469ADC] tracking-wide">
            Hercules CRM
          </span>
        </div>
        {/* Slide toggle */}
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '11px', fontWeight: mode === 'quote' ? 600 : 400, color: mode === 'quote' ? '#253461' : '#999' }}>Quote</span>
          <button
            type="button"
            onClick={() => onModeChange(mode === 'quote' ? 'order' : 'quote')}
            style={{
              position: 'relative',
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              background: mode === 'order' ? '#253461' : '#ccc',
              transition: 'background 0.2s',
              padding: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '2px',
                left: mode === 'order' ? '18px' : '2px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </button>
          <span style={{ fontSize: '11px', fontWeight: mode === 'order' ? 600 : 400, color: mode === 'order' ? '#253461' : '#999' }}>Order</span>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-[Jost,sans-serif] text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-6 h-6 border-2 border-gray-200 border-t-[#253461] rounded-full animate-spin mx-auto" />
  );
}
