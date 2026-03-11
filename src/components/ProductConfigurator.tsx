import { useState, useEffect, useMemo } from 'react';

// === Types matching the hercules product-config API ===

interface TermInfo { slug: string; name: string; description: string; thumbnail_id: number; thumbnail_url: string; }
interface AttributeData {
  terms: TermInfo[];
  display_type: 'dropdown' | 'image_selector' | 'select_boxes';
  display_title: string;
  display_description: string;
  enabled_if: string;
  enabled_if_value: string;
  minimum_qty: string;
}
interface AddonOption { name: string; image: string; price_table: Array<{ qty: number; price: number }>; }
interface AddonData {
  id: number;
  name: string;
  display_type: 'dropdown' | 'image_selector' | 'select_boxes' | 'multiple_choise';
  parent_id: number;
  visible_if_option: string;
  options: AddonOption[];
}
interface VariationData {
  variation_id: number;
  attributes: Record<string, string>;
  display_price: number;
  display_regular_price: number;
  image: { url: string; alt: string; title?: string } | null;
  is_in_stock: boolean;
  conditional_prices: Array<{ qty: number | string; price: number | string }>;
  lead_time: string;
}
interface ProductConfig {
  product_id: number;
  product_name: string;
  product_slug: string;
  attributes: Record<string, AttributeData>;
  addons: AddonData[];
  variations: VariationData[];
  currency_code: string;
  currency_symbol: string;
  currency_position: string;
  tax_percent: number;
  estimated_delivery_date: string;
  minimum_quantity: string;
}
interface Props { productId: number; productName: string; region: string; customerEmail?: string; }

// === Pricing helpers (exact same logic as live website) ===

function parseFloatSafe(val: any): number {
  if (val === null || val === undefined) return 0;
  const str = String(val).replace(',', '.');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function getAddonPriceAtTierQty(addon: AddonData, selectedValue: string | string[], tierQty: number): number {
  if (!selectedValue) return 0;
  const names = Array.isArray(selectedValue) ? selectedValue : [selectedValue];
  let total = 0;
  for (const name of names) {
    if (name === 'Keins' || name === 'None' || name === 'Aucun') continue;
    const opt = addon.options.find(o => o.name === name);
    if (!opt?.price_table?.length) continue;
    const sorted = [...opt.price_table].map(p => ({ qty: parseFloatSafe(p.qty), price: parseFloatSafe(p.price) })).sort((a, b) => a.qty - b.qty);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (tierQty >= sorted[i].qty) { total += sorted[i].price; break; }
    }
  }
  return total;
}

function getInterpolatedPriceWithAddons(
  conditionalPrices: Array<{ qty: number | string; price: number | string }>,
  quantity: number, addons: AddonData[], selectedAddons: Record<number, string | string[]>
): number {
  if (!conditionalPrices?.length) return 0;
  const combinedTiers = conditionalPrices.map(cp => {
    const tierQty = parseFloatSafe(cp.qty);
    const basePrice = parseFloatSafe(cp.price);
    let addonPrice = 0;
    for (const addon of addons) { if (selectedAddons[addon.id]) addonPrice += getAddonPriceAtTierQty(addon, selectedAddons[addon.id], tierQty); }
    return { qty: tierQty, price: basePrice + addonPrice };
  }).sort((a, b) => a.qty - b.qty);
  const exact = combinedTiers.find(t => t.qty === quantity);
  if (exact) return exact.price;
  let below: { qty: number; price: number } | null = null;
  let above: { qty: number; price: number } | null = null;
  for (const t of combinedTiers) { if (t.qty < quantity) below = t; if (t.qty > quantity && !above) above = t; }
  if (below && above && above.qty !== below.qty) return below.price + ((above.price - below.price) * (quantity - below.qty)) / (above.qty - below.qty);
  if (below) return below.price;
  if (above) return above.price;
  return combinedTiers[0]?.price || 0;
}

function decodeHtml(html: string): string {
  if (typeof document !== 'undefined') { const t = document.createElement('textarea'); t.innerHTML = html; return t.value; }
  return html.replace('&euro;', '\u20AC').replace('&pound;', '\u00A3');
}

// === Component — uses exact same HTML structure & CSS classes as the live website ===

export default function ProductConfigurator({ productId, productName, region, customerEmail }: Props) {
  const [mode, setMode] = useState<'quote' | 'order'>('quote');
  const [config, setConfig] = useState<ProductConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxVisibleStep, setMaxVisibleStep] = useState(0);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [selectedAddons, setSelectedAddons] = useState<Record<number, string | string[]>>({});
  const [quantitySelected, setQuantitySelected] = useState(0);
  const [tempQuantity, setTempQuantity] = useState(50);
  const [showDeliveryTooltip, setShowDeliveryTooltip] = useState(false);
  const [setupFeeOverride, setSetupFeeOverride] = useState<string | null>(null);
  const [shippingOverride, setShippingOverride] = useState<string | null>(null);
  const [quoteName, setQuoteName] = useState('');
  const [pricePerPieceOverride, setPricePerPieceOverride] = useState<string | null>(null);
  const [totalNetOverride, setTotalNetOverride] = useState<string | null>(null);
  const [totalGrossOverride, setTotalGrossOverride] = useState<string | null>(null);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{ success: boolean; quote_id?: number; site_quote_id?: number; quote_url?: string; pdf_url?: string; email_sent?: boolean; site_error?: string; order_id?: number; order_number?: string; order_url?: string; order_status?: string; error?: string } | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setSelectedAttributes({}); setSelectedAddons({}); setQuantitySelected(0); setMaxVisibleStep(0);
    fetch(`/api/wc/product-config?region=${region}&id=${productId}`)
      .then(r => { if (!r.ok) throw new Error(`Failed to load config: ${r.status}`); return r.json(); })
      .then(data => {
        setConfig(data);
        setTempQuantity(Math.max(parseInt(data.minimum_quantity || '50', 10), 1));
        const auto: Record<string, string> = {};
        let hasVisible = false;
        Object.entries(data.attributes as Record<string, AttributeData>).forEach(([key, attr]) => {
          if (attr.terms.length === 1 && attr.terms[0].slug === 'default') auto[key] = 'default';
          else hasVisible = true;
        });
        if (Object.keys(auto).length > 0) setSelectedAttributes(auto);
        if (!hasVisible) setMaxVisibleStep(0);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [productId, region]);

  const attributeKeys = useMemo(() => config ? Object.keys(config.attributes) : [], [config]);
  const visibleAttributeKeys = useMemo(() => attributeKeys.filter(k => { const a = config!.attributes[k]; return !(a.terms.length === 1 && a.terms[0].slug === 'default'); }), [config, attributeKeys]);

  const isAttributeVisible = (attrKey: string, index: number): boolean => {
    if (!config) return false;
    if (index === 0) return true;
    const attr = config.attributes[attrKey];
    if (!attr.enabled_if || !attr.enabled_if_value) return true;
    const ck = attributeKeys.find(k => k.includes(attr.enabled_if));
    return ck ? selectedAttributes[ck] === attr.enabled_if_value : true;
  };

  const visibleAddons = useMemo(() => {
    if (!config?.addons.length) return [];
    const vis: AddonData[] = [];
    config.addons.filter(a => a.parent_id === 0).forEach(parent => {
      if (Array.isArray(parent.options) && parent.options.length > 0) vis.push(parent);
      const child = config.addons.find(a => a.parent_id === parent.id && selectedAddons[parent.id] === a.visible_if_option);
      if (child && Array.isArray(child.options) && child.options.length > 0) {
        vis.push(child);
        const gc = config.addons.find(a => a.parent_id === child.id && selectedAddons[child.id] === a.visible_if_option);
        if (gc && Array.isArray(gc.options) && gc.options.length > 0) vis.push(gc);
      }
    });
    return vis;
  }, [config, selectedAddons]);

  const matchedVariation = useMemo(() => {
    if (!config) return null;
    return config.variations.find(v => Object.entries(v.attributes).every(([key, value]) => {
      const nk = key.replace('attribute_', '');
      return (selectedAttributes[key] || selectedAttributes[`attribute_${nk}`] || selectedAttributes[nk]) === value;
    })) || null;
  }, [config, selectedAttributes]);

  const quantityRange = useMemo(() => {
    const prices = matchedVariation?.conditional_prices || config?.variations?.[0]?.conditional_prices;
    if (!prices?.length) return { min: 50, max: 500 };
    const qtys = prices.map(p => parseFloatSafe(p.qty));
    let minQty = Math.min(...qtys), maxQty = Math.max(...qtys);
    for (const addon of visibleAddons) {
      const selected = selectedAddons[addon.id]; if (!selected) continue;
      const selectedNames = Array.isArray(selected) ? selected : [selected];
      for (const name of selectedNames) {
        if (name === 'None' || name === 'Keins' || name === 'Aucun') continue;
        const option = addon.options.find(o => o.name === name);
        if (option?.price_table?.length) {
          const firstQty = parseFloatSafe(option.price_table[0].qty);
          if (firstQty > 0) minQty = Math.max(minQty, firstQty);
          const lastQty = parseFloatSafe(option.price_table[option.price_table.length - 1].qty);
          if (lastQty > 0) maxQty = Math.max(maxQty, lastQty);
        }
      }
    }
    return { min: minQty, max: maxQty };
  }, [matchedVariation, config, visibleAddons, selectedAddons]);

  useEffect(() => {
    if (quantitySelected > 0 && quantitySelected < quantityRange.min) { setQuantitySelected(0); setTempQuantity(quantityRange.min); }
    else if (tempQuantity < quantityRange.min) setTempQuantity(quantityRange.min);
  }, [quantityRange.min]);

  const totalSteps = visibleAttributeKeys.length + visibleAddons.length + 1;
  const quantityStepIndex = visibleAttributeKeys.length + visibleAddons.length;

  const priceInfo = useMemo(() => {
    if (!matchedVariation || quantitySelected <= 0) return null;
    const pp = Math.round(getInterpolatedPriceWithAddons(matchedVariation.conditional_prices, quantitySelected, visibleAddons, selectedAddons) * 100) / 100;
    const net = Math.round(pp * quantitySelected * 100) / 100;
    const tax = config ? 1 + config.tax_percent / 100 : 1.19;
    return { pricePerPiece: pp, totalExclVat: net, totalInclVat: Math.round(net * tax * 100) / 100, taxPercent: config?.tax_percent || 19, leadTime: matchedVariation.lead_time || '5 Weeks' };
  }, [matchedVariation, quantitySelected, visibleAddons, selectedAddons, config]);

  const currencySymbol = config ? decodeHtml(config.currency_symbol) : '\u20AC';

  const taxMultiplier = config ? 1 + config.tax_percent / 100 : 1.19;

  const handlePricePerPieceChange = (val: string) => {
    setPricePerPieceOverride(val);
    const num = parseFloat(val);
    if (!isNaN(num) && quantitySelected > 0) {
      const net = Math.round(num * quantitySelected * 100) / 100;
      setTotalNetOverride(net.toFixed(2));
      setTotalGrossOverride((Math.round(net * taxMultiplier * 100) / 100).toFixed(2));
    }
  };

  const handleTotalNetChange = (val: string) => {
    setTotalNetOverride(val);
    const num = parseFloat(val);
    if (!isNaN(num) && quantitySelected > 0) {
      setPricePerPieceOverride((Math.round(num / quantitySelected * 100) / 100).toFixed(2));
      setTotalGrossOverride((Math.round(num * taxMultiplier * 100) / 100).toFixed(2));
    }
  };

  const handleTotalGrossChange = (val: string) => {
    setTotalGrossOverride(val);
    const num = parseFloat(val);
    if (!isNaN(num) && quantitySelected > 0) {
      const net = Math.round(num / taxMultiplier * 100) / 100;
      setTotalNetOverride(net.toFixed(2));
      setPricePerPieceOverride((Math.round(net / quantitySelected * 100) / 100).toFixed(2));
    }
  };

  const handleAttributeSelect = (attrKey: string, value: string, stepIndex: number) => { setSelectedAttributes(prev => ({ ...prev, [attrKey]: value })); setMaxVisibleStep(stepIndex + 1); };
  const handleAddonSelect = (addonId: number, value: string | string[], stepIndex: number) => { setSelectedAddons(prev => ({ ...prev, [addonId]: value })); setMaxVisibleStep(stepIndex + 1); };
  const handleQuantityConfirm = () => { if (tempQuantity >= quantityRange.min && tempQuantity <= quantityRange.max) { setQuantitySelected(tempQuantity); setMaxVisibleStep(quantityStepIndex + 1); } };

  const getAddonExtra = (qty: number): number => { let t = 0; for (const a of visibleAddons) { if (selectedAddons[a.id]) t += getAddonPriceAtTierQty(a, selectedAddons[a.id], qty); } return t; };

  const allAttributesSelected = attributeKeys.every(k => selectedAttributes[k]);
  const allAddonsSelected = visibleAddons.every(addon => { const v = selectedAddons[addon.id]; return addon.display_type === 'multiple_choise' ? Array.isArray(v) && v.length > 0 : !!v; });
  const canAddToQuote = allAttributesSelected && allAddonsSelected && quantitySelected > 0 && matchedVariation;

  const handleSubmit = async () => {
    if (!canAddToQuote || !priceInfo || !config || !matchedVariation) return;
    setQuoteSubmitting(true);
    setQuoteResult(null);
    const finalPricePerPiece = pricePerPieceOverride ? parseFloat(pricePerPieceOverride) : priceInfo.pricePerPiece;
    const finalTotalNet = totalNetOverride ? parseFloat(totalNetOverride) : priceInfo.totalExclVat;
    const finalTotalGross = totalGrossOverride ? parseFloat(totalGrossOverride) : priceInfo.totalInclVat;
    const selections: Record<string, string> = {};
    for (const key of visibleAttributeKeys) { const attr = config.attributes[key]; const slug = selectedAttributes[key]; const term = attr.terms.find(t => t.slug === slug); selections[attr.display_title || key] = term?.name || slug; }
    for (const addon of visibleAddons) { const val = selectedAddons[addon.id]; selections[addon.name] = Array.isArray(val) ? val.join(', ') : val; }
    const lineItem = { product_id: productId, product_name: productName, variation_id: matchedVariation.variation_id, quantity: quantitySelected, price_per_piece: finalPricePerPiece, total_net: finalTotalNet, total_gross: finalTotalGross, tax_percent: priceInfo.taxPercent, setup_fee: setupFeeOverride ?? 'Free', shipping: shippingOverride ?? 'Free', lead_time: priceInfo.leadTime, selections };
    try {
      if (mode === 'order') {
        const resp = await fetch('/api/wc/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region, customer_email: customerEmail || '', line_items: [lineItem], total: finalTotalGross, notes: quoteName || '' }) });
        const data = await resp.json();
        if (resp.ok && data.success) { setQuoteResult({ success: true, order_id: data.order_id, order_number: data.order_number, order_url: data.order_url, order_status: data.order_status }); }
        else { setQuoteResult({ success: false, error: data.error || 'Failed to create order' }); }
      } else {
        const resp = await fetch('/api/wc/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region, customer_email: customerEmail || '', quote_name: quoteName || productName, line_items: [lineItem], total: finalTotalGross, currency: config.currency_code || 'EUR' }) });
        const data = await resp.json();
        if (resp.ok && data.success) { setQuoteResult({ success: true, quote_id: data.quote_id, site_quote_id: data.site_quote_id, quote_url: data.quote_url, pdf_url: data.pdf_url, email_sent: data.email_sent, site_error: data.site_error }); }
        else { setQuoteResult({ success: false, error: data.error || 'Failed to create quote' }); }
      }
    } catch (err: any) { setQuoteResult({ success: false, error: err.message || 'Network error' }); }
    finally { setQuoteSubmitting(false); }
  };

  const currentStepNum = Math.min(maxVisibleStep + 1, totalSteps);

  if (loading) return <div id="pearl-wc-steps-form"><div className="pearl-step-indicator"><h2>Loading...</h2></div></div>;
  if (error || !config) return <div id="pearl-wc-steps-form"><div className="pearl-step-indicator"><h2>Error loading configuration</h2></div>{error && <p style={{ color: '#dc3545', fontSize: '14px', padding: '10px 21px' }}>{error}</p>}</div>;

  const minQuantity = parseInt(config.minimum_quantity || '50', 10);

  // Render — exact same structure as website ProductConfigurator
  return (
    <>
    <div id="pearl-wc-steps-form" className="pearl-wc-steps-form">
      {/* Quote / Order toggle */}
      <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid #ddd', marginBottom: '15px' }}>
        <button
          type="button"
          onClick={() => { setMode('quote'); setQuoteResult(null); }}
          style={{
            flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: mode === 'quote' ? '#253461' : '#f5f5f5',
            color: mode === 'quote' ? '#fff' : '#666',
          }}
        >
          Quote
        </button>
        <button
          type="button"
          onClick={() => { setMode('order'); setQuoteResult(null); }}
          style={{
            flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
            background: mode === 'order' ? '#253461' : '#f5f5f5',
            color: mode === 'order' ? '#fff' : '#666',
          }}
        >
          Order
        </button>
      </div>

      <div className="pearl-step-indicator">
        <h2>CONFIGURE YOUR PRODUCT — STEP {currentStepNum} OF {totalSteps}</h2>
        <span>From <strong>{minQuantity} PCS</strong></span>
      </div>

      {/* Attribute Steps */}
      {visibleAttributeKeys.map((attrKey, visibleIndex) => {
        if (!isAttributeVisible(attrKey, visibleIndex)) return null;
        const attr = config.attributes[attrKey];
        const isExpanded = maxVisibleStep === visibleIndex;
        const selectedValue = selectedAttributes[attrKey];
        const isCompleted = !!selectedValue;
        const stepClass = `pearl-step ${isExpanded ? '' : 'collapsed'} ${isCompleted && !isExpanded ? 'selected' : ''}`.trim();

        return (
          <div key={attrKey} className={stepClass} onClick={!isExpanded && isCompleted ? () => setMaxVisibleStep(visibleIndex) : undefined}>
            <h3>
              {!isExpanded && isCompleted ? (
                <>
                  <div className="kd-prod-attribute-title-wrapper"><span>{visibleIndex + 1}: {attr.display_title || attrKey.replace('pa_', '').replace(/_/g, ' ')}</span></div>
                  <span className="kd-selected-val">{attr.terms.find(t => t.slug === selectedValue)?.name || selectedValue}</span>
                  <button type="button" className="kd-selected-chng-btn" onClick={e => { e.stopPropagation(); setMaxVisibleStep(visibleIndex); }}>Modify</button>
                </>
              ) : (
                <div className="kd-prod-attribute-title-wrapper"><span>{visibleIndex + 1}: {attr.display_title || attrKey.replace('pa_', '').replace(/_/g, ' ')}</span></div>
              )}
            </h3>
            {isExpanded && (
              <div className="kd-step-collapse">
                {attr.display_description && <p style={{ marginBottom: '10px', color: '#666' }}>{attr.display_description}</p>}
                {attr.display_type === 'image_selector' && (
                  <div className="kd-image-selector" style={{ display: 'flex', flexFlow: 'row wrap', gap: '20px' }}>
                    {attr.terms.map(term => (
                      <div key={term.slug} className="kd-image-selector-col" onClick={() => handleAttributeSelect(attrKey, term.slug, visibleIndex)}
                        style={{ border: selectedValue === term.slug ? '2px solid #469ADC' : '1px solid #ccc', background: selectedValue === term.slug ? '#e6f0fa' : '#fff', padding: '10px', borderRadius: '10px', cursor: 'pointer', display: 'inline-flex', justifyContent: 'space-between', alignItems: 'center', flexFlow: 'row', width: '30.5%' }}>
                        <div className="kd-image-selector-title">{term.name}</div>
                        {term.thumbnail_url && <img src={term.thumbnail_url} alt={term.name} style={{ height: '48px', objectFit: 'contain', marginLeft: '5px' }} />}
                      </div>
                    ))}
                  </div>
                )}
                {attr.display_type === 'dropdown' && (
                  <select value={selectedValue || ''} onChange={e => handleAttributeSelect(attrKey, e.target.value, visibleIndex)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #ddd' }}>
                    <option value="">Select an option</option>
                    {attr.terms.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                  </select>
                )}
                {attr.display_type === 'select_boxes' && (
                  <div className="box-selector" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {attr.terms.map(term => (
                      <div key={term.slug} className="box-selector-item" onClick={() => handleAttributeSelect(attrKey, term.slug, visibleIndex)}
                        style={{ cursor: 'pointer', border: selectedValue === term.slug ? '2px solid #469ADC' : '1px solid #ddd', padding: '10px', borderRadius: '10px', width: '31%', background: selectedValue === term.slug ? '#e6f0fa' : '#fff' }}>
                        <strong>{term.name}</strong>
                        {term.description && <p style={{ fontSize: '12px', marginTop: '5px' }}>{term.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Addon Steps */}
      {visibleAddons.map((addon, addonIndex) => {
        const stepIndex = visibleAttributeKeys.length + addonIndex;
        const isExpanded = maxVisibleStep === stepIndex;
        const selectedValue = selectedAddons[addon.id];
        const isCompleted = addon.display_type === 'multiple_choise' ? Array.isArray(selectedValue) && selectedValue.length > 0 : !!selectedValue;
        const stepClass = `pearl-step ${isExpanded ? '' : 'collapsed'} ${isCompleted && !isExpanded ? 'selected' : ''}`.trim();

        return (
          <div key={`addon_${addon.id}`} className={stepClass} onClick={!isExpanded && isCompleted ? () => setMaxVisibleStep(stepIndex) : undefined}>
            <h3>
              {!isExpanded && isCompleted ? (
                <>
                  <div className="kd-prod-attribute-title-wrapper"><span>{stepIndex + 1}: {addon.name}</span></div>
                  <span className="kd-selected-val">{Array.isArray(selectedValue) ? selectedValue.join(', ') : selectedValue}</span>
                  <button type="button" className="kd-selected-chng-btn" onClick={e => { e.stopPropagation(); setMaxVisibleStep(stepIndex); }}>Modify</button>
                </>
              ) : (
                <div className="kd-prod-attribute-title-wrapper"><span>{stepIndex + 1}: {addon.name}</span></div>
              )}
            </h3>
            {isExpanded && (
              <div className="kd-step-collapse">
                {addon.display_type === 'image_selector' && Array.isArray(addon.options) && (
                  <div className="kd-image-selector" style={{ display: 'flex', flexFlow: 'row wrap', gap: '20px' }}>
                    {addon.options.map(option => (
                      <div key={option.name} className="kd-image-selector-col" onClick={() => handleAddonSelect(addon.id, option.name, stepIndex)}
                        style={{ border: selectedValue === option.name ? '2px solid #469ADC' : '1px solid #ccc', background: selectedValue === option.name ? '#e6f0fa' : '#fff', padding: '10px', borderRadius: '10px', cursor: 'pointer', display: 'inline-flex', justifyContent: 'space-between', alignItems: 'center', flexFlow: 'row', width: '30.5%' }}>
                        <div className="kd-image-selector-title">{option.name}</div>
                        {option.image && <img src={option.image} alt={option.name} style={{ height: '48px', objectFit: 'contain', marginLeft: '5px' }} />}
                      </div>
                    ))}
                  </div>
                )}
                {addon.display_type === 'dropdown' && Array.isArray(addon.options) && (
                  <select value={typeof selectedValue === 'string' ? selectedValue : ''} onChange={e => handleAddonSelect(addon.id, e.target.value, stepIndex)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #ddd' }}>
                    <option value="">Select an option</option>
                    {addon.options.map(o => <option key={o.name} value={o.name}>{o.name}</option>)}
                  </select>
                )}
                {addon.display_type === 'multiple_choise' && Array.isArray(addon.options) && (() => {
                  const cur = Array.isArray(selectedValue) ? selectedValue : (selectedValue ? [selectedValue as string] : []);
                  const isNoneChecked = cur.includes('None') || cur.includes('Keins') || cur.includes('Aucun');
                  const handleCb = (value: string, checked: boolean) => {
                    let ns: string[];
                    if (value === 'None' || value === 'Keins' || value === 'Aucun') ns = checked ? [value] : [];
                    else { const wn = cur.filter(v => v !== 'None' && v !== 'Keins' && v !== 'Aucun'); ns = checked ? [...wn, value] : wn.filter(v => v !== value); }
                    setSelectedAddons(prev => ({ ...prev, [addon.id]: ns }));
                    if (ns.length > 0) setMaxVisibleStep(stepIndex + 1);
                  };
                  return (
                    <div className="kd-step-choises">
                      <label style={{ display: 'block', marginBottom: '8px' }}><input type="checkbox" checked={isNoneChecked} onChange={e => handleCb('None', e.target.checked)} style={{ marginRight: '8px' }} />None</label>
                      {addon.options.map((option, i) => <label key={i} style={{ display: 'block', marginBottom: '8px' }}><input type="checkbox" checked={cur.includes(option.name)} onChange={e => handleCb(option.name, e.target.checked)} style={{ marginRight: '8px' }} />{option.name}</label>)}
                    </div>
                  );
                })()}
                {addon.display_type === 'select_boxes' && Array.isArray(addon.options) && (
                  <div className="box-selector" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {addon.options.map(option => (
                      <div key={option.name} className="box-selector-item" onClick={() => handleAddonSelect(addon.id, option.name, stepIndex)}
                        style={{ cursor: 'pointer', border: selectedValue === option.name ? '2px solid #469ADC' : '1px solid #ddd', padding: '10px', borderRadius: '10px', width: '31%', background: selectedValue === option.name ? '#e6f0fa' : '#fff' }}>
                        <strong>{option.name}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Quantity Step */}
      {(matchedVariation || config.variations?.length > 0) && (
        <div className={`pearl-step ${maxVisibleStep === quantityStepIndex ? '' : 'collapsed'} ${quantitySelected > 0 && maxVisibleStep !== quantityStepIndex ? 'selected' : ''}`.trim()}
          onClick={maxVisibleStep !== quantityStepIndex && quantitySelected > 0 ? () => setMaxVisibleStep(quantityStepIndex) : undefined}>
          <h3>
            {maxVisibleStep !== quantityStepIndex && quantitySelected > 0 ? (
              <>
                <div className="kd-prod-attribute-title-wrapper"><span>{quantityStepIndex + 1}: Your quantity</span></div>
                <span className="kd-selected-val">{quantitySelected}</span>
                <button type="button" className="kd-selected-chng-btn" onClick={e => { e.stopPropagation(); setMaxVisibleStep(quantityStepIndex); }}>Modify</button>
              </>
            ) : (
              <div className="kd-prod-attribute-title-wrapper"><span>{quantityStepIndex + 1}: Choose your quantity</span></div>
            )}
          </h3>
          {maxVisibleStep === quantityStepIndex && (
            <div className="kd-step-collapse">
              {(matchedVariation?.conditional_prices || config.variations?.[0]?.conditional_prices || [])
                .filter(tier => parseFloatSafe(tier.qty) >= quantityRange.min)
                .map((tier, idx, filteredTiers) => {
                  const tierQty = parseFloatSafe(tier.qty); const tierPrice = parseFloatSafe(tier.price);
                  const totalPrice = tierPrice + getAddonExtra(tierQty);
                  const firstTier = filteredTiers[0]; const firstPrice = parseFloatSafe(firstTier.price) + getAddonExtra(parseFloatSafe(firstTier.qty));
                  const savings = firstPrice > 0 ? Math.round((1 - totalPrice / firstPrice) * 100) : 0;
                  return (
                    <label key={idx} className="kd-radio-option">
                      <div>
                        <input type="radio" name="qty_option" checked={quantitySelected === tierQty} onChange={() => { setQuantitySelected(tierQty); setTempQuantity(tierQty); setMaxVisibleStep(quantityStepIndex + 1); }} />
                        <span>{tierQty}</span>
                      </div>
                      <div className="kd-radio-meta">
                        {savings > 0 && <span className="save">Save {savings}%</span>}
                        <span>{totalPrice.toFixed(2)} {currencySymbol}</span>
                      </div>
                    </label>
                  );
                })}
              <label className="kd-radio-option kd-contact-option">
                <div><input type="radio" name="qty_option" checked={false} onChange={() => {}} /><span>{quantityRange.max}+</span></div>
                <div className="kd-radio-meta kd-contact-meta"><button type="button" className="step-contact">CONTACT US</button></div>
              </label>
              <div className="range-wrapper">
                <h4 className="specific-qty-title">Or choose a specific quantity</h4>
                <div className="kd-range-slider-container">
                  <div className="kd-qty-display" style={{ left: `calc(${((tempQuantity - quantityRange.min) / (quantityRange.max - quantityRange.min)) * 100}% + ${8 - ((tempQuantity - quantityRange.min) / (quantityRange.max - quantityRange.min)) * 16}px)` }}>{tempQuantity}</div>
                  <input type="range" min={quantityRange.min} max={quantityRange.max} value={tempQuantity} onChange={e => setTempQuantity(parseInt(e.target.value))}
                    style={{ background: `linear-gradient(to right, #253461 0%, #253461 ${((tempQuantity - quantityRange.min) / (quantityRange.max - quantityRange.min)) * 100}%, #E3E3E3 ${((tempQuantity - quantityRange.min) / (quantityRange.max - quantityRange.min)) * 100}%, #E3E3E3 100%)` }} />
                  <div className="kd-range-ticks">
                    {Array.from({ length: 11 }, (_, i) => {
                      const tv = Math.round(quantityRange.min + (i * (quantityRange.max - quantityRange.min) / 10));
                      return <span key={i} className="kd-qty-range-price-tooltip" style={{ position: 'absolute', left: `${((tv - quantityRange.min) / (quantityRange.max - quantityRange.min)) * 100}%`, transform: 'translateX(-50%)' }}>{tv}</span>;
                    })}
                  </div>
                </div>
                <div className="kd-qty-controls">
                  <input type="number" className="kd-qty-input" min={quantityRange.min} max={quantityRange.max} value={tempQuantity} onChange={e => setTempQuantity(parseInt(e.target.value) || quantityRange.min)} />
                  <button type="button" className="kd-round-btn" onClick={() => setTempQuantity(prev => Math.min(quantityRange.max, prev + 1))}>+</button>
                  <button type="button" className="kd-round-btn" onClick={() => setTempQuantity(prev => Math.max(quantityRange.min, prev - 1))}>-</button>
                  <button type="button" className="kd-verify-qty-btn" onClick={handleQuantityConfirm}>CONFIRM</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary — editable fields for CRM */}
      {priceInfo && quantitySelected > 0 && (
        <div className="variation-summary">
          <h3 className="your-offer-title">{quantityStepIndex + 2}. Your offer</h3>
          <table className="offer-table">
            <tbody>
              <tr><td>Shipping</td><td className="kd-free-value"><input type="text" className="kd-editable-field" value={shippingOverride ?? 'Free'} onChange={e => setShippingOverride(e.target.value)} /></td></tr>
              <tr>
                <td>Setup fee</td>
                <td className="kd-free-value">
                  <input type="text" className="kd-editable-field" value={setupFeeOverride ?? 'Free'} onChange={e => setSetupFeeOverride(e.target.value)} />
                </td>
              </tr>
              <tr>
                <td>All-inclusive price per piece</td>
                <td className="kd-price-value">
                  <input type="text" className="kd-editable-field" value={pricePerPieceOverride ?? priceInfo.pricePerPiece.toFixed(2)} onChange={e => handlePricePerPieceChange(e.target.value)} /> {currencySymbol} (net)
                </td>
              </tr>
              <tr>
                <td>Total (net)</td>
                <td className="kd-total-value">
                  <input type="text" className="kd-editable-field" value={totalNetOverride ?? priceInfo.totalExclVat.toFixed(2)} onChange={e => handleTotalNetChange(e.target.value)} /> {currencySymbol}
                </td>
              </tr>
              <tr>
                <td>Total (incl. {priceInfo.taxPercent}% VAT)</td>
                <td>
                  <input type="text" className="kd-editable-field" value={totalGrossOverride ?? priceInfo.totalInclVat.toFixed(2)} onChange={e => handleTotalGrossChange(e.target.value)} /> {currencySymbol}
                </td>
              </tr>
              <tr>
                <td className="kd-lieferzeit-cell">Lead time
                  <span className="kd-tooltip-trigger" onMouseEnter={() => setShowDeliveryTooltip(true)} onMouseLeave={() => setShowDeliveryTooltip(false)}>?
                    {showDeliveryTooltip && <span className="kd-tooltip-content">Lead time starts after design approval and payment receipt. For express delivery, please contact us.</span>}
                  </span>
                </td>
                <td><span className="kd-delivery-content">{config.estimated_delivery_date && <span>{config.estimated_delivery_date}<br/></span>}<span>{priceInfo.leadTime}</span></span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Quote name */}
      {priceInfo && quantitySelected > 0 && (
        <div className="kd-quote-name-wrapper">
          <label>Quote name</label>
          <input type="text" placeholder={productName} value={quoteName} onChange={e => setQuoteName(e.target.value)} />
        </div>
      )}
      <div className="kd-action-btns-wrapper">
        <div className="kd-single-action-btn">
          <button type="button" disabled={!canAddToQuote || quoteSubmitting} onClick={handleSubmit}>{quoteSubmitting ? 'Creating...' : mode === 'order' ? 'Create Order' : 'Create Quote'}</button>
          <small>{mode === 'order' ? 'Create a WooCommerce order' : 'Generate a quotation for the customer'}</small>
        </div>
        {quoteResult && (
          <div style={{ marginTop: '10px', padding: '10px 15px', borderRadius: '8px', fontSize: '13px', background: quoteResult.success ? '#e6faf3' : '#fde8e8', color: quoteResult.success ? '#0a7d5a' : '#dc3545' }}>
            {quoteResult.success ? (
              mode === 'order' && quoteResult.order_id ? (
                <div>
                  Order <a href={quoteResult.order_url} target="_blank" rel="noopener" style={{ color: '#253461', textDecoration: 'underline' }}>#{quoteResult.order_number || quoteResult.order_id}</a> created on {region} site
                  {quoteResult.order_status && <span> ({quoteResult.order_status})</span>}
                </div>
              ) : (<>
                <div>Quote #{quoteResult.quote_id} created!</div>
                {quoteResult.site_quote_id && (
                  <div style={{ marginTop: '4px' }}>
                    Quote <a href={quoteResult.quote_url} target="_blank" rel="noopener" style={{ color: '#253461', textDecoration: 'underline' }}>#{quoteResult.site_quote_id}</a> created on {region} site
                    {quoteResult.email_sent && ' — email sent to customer'}
                    {quoteResult.pdf_url && <> — <a href={quoteResult.pdf_url} target="_blank" rel="noopener" style={{ color: '#253461', textDecoration: 'underline' }}>PDF</a></>}
                  </div>
                )}
                {quoteResult.site_error && <div style={{ marginTop: '4px', color: '#b45309' }}>Site error: {quoteResult.site_error}</div>}
              </>)
            ) : `Error: ${quoteResult.error}`}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
