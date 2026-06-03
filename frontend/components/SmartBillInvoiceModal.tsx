'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface SeriesItem {
  name: string;
  nextNumber?: number;
}

interface ProductResult {
  name: string;
  code?: string;
  measuringUnit?: string;
  quantity?: number;
}

type ClientType = 'company' | 'person';
type ClientStatus = 'idle' | 'found' | 'new';
type Step = 'client' | 'product' | 'amount' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultClientName?: string;
  defaultClientEmail?: string;
}

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'client', label: 'Client' },
  { key: 'product', label: 'Produs' },
  { key: 'amount', label: 'Sumă' },
];

const RO_COUNTIES = [
  'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov',
  'Brăila', 'București', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
  'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara',
  'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt',
  'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea',
  'Vaslui', 'Vâlcea', 'Vrancea',
];

const COUNTRIES = [
  'Romania', 'Republica Moldova', 'Austria', 'Belgia', 'Bulgaria', 'Cehia', 'Cipru',
  'Croația', 'Danemarca', 'Elveția', 'Estonia', 'Finlanda', 'Franța', 'Germania',
  'Grecia', 'Irlanda', 'Italia', 'Letonia', 'Lituania', 'Luxemburg', 'Malta',
  'Marea Britanie', 'Norvegia', 'Olanda', 'Polonia', 'Portugalia', 'Slovacia',
  'Slovenia', 'Spania', 'Suedia', 'Ungaria', 'Statele Unite',
];

export default function SmartBillInvoiceModal({
  open,
  onClose,
  defaultClientName,
  defaultClientEmail,
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [selectedSeries, setSelectedSeries] = useState('');

  const [step, setStep] = useState<Step>('client');

  // Client
  const [clientType, setClientType] = useState<ClientType>('company');
  const [clientStatus, setClientStatus] = useState<ClientStatus>('idle');
  const [cui, setCui] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientCounty, setClientCounty] = useState('');
  const [clientCountry, setClientCountry] = useState('Romania');
  const [clientVatCode, setClientVatCode] = useState('');
  const [isTaxPayer, setIsTaxPayer] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  // Product
  const [productResults, setProductResults] = useState<ProductResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [productName, setProductName] = useState('');
  const [measuringUnit, setMeasuringUnit] = useState('buc');
  const [isService, setIsService] = useState(true);

  // Amount
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [vatOption, setVatOption] = useState<'normal' | 'redus' | 'none'>('normal');
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [currency, setCurrency] = useState('RON');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [created, setCreated] = useState<{ series: string; number: string } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    resetState();
    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetState = () => {
    setError('');
    setSuccess('');
    setCreated(null);
    setStep('client');
    setClientType('company');
    setClientStatus('idle');
    setCui('');
    setClientName(defaultClientName || '');
    setClientEmail(defaultClientEmail || '');
    setClientAddress('');
    setClientCity('');
    setClientCounty('');
    setClientCountry('Romania');
    setClientVatCode('');
    setIsTaxPayer(false);
    setProductResults([]);
    setShowResults(false);
    setProductName('');
    setMeasuringUnit('buc');
    setIsService(true);
    setPrice('');
    setQuantity('1');
    setVatOption('normal');
    setTaxIncluded(true);
    setCurrency('RON');
  };

  const initialize = async () => {
    try {
      const status = await api.get('/integrations/smartbill/status');
      const isConnected = status.data?.connected === true;
      setConnected(isConnected);
      if (!isConnected) return;
      const seriesResp = await api.get('/integrations/smartbill/series');
      const list: SeriesItem[] = Array.isArray(seriesResp.data) ? seriesResp.data : [];
      setSeries(list);
      const preferred = list.find((s) => s.name.toUpperCase() === 'TRS');
      setSelectedSeries((preferred || list[0])?.name || '');
    } catch (err: any) {
      setConnected(false);
      setError(err?.response?.data?.message || 'Nu am putut încărca datele SmartBill.');
    }
  };

  // ─── Client ──────────────────────────────────────────────────────────────

  const lookupCompany = async () => {
    if (!cui.trim()) {
      setError('Completează CUI-ul.');
      return;
    }
    setLookupBusy(true);
    setError('');
    try {
      const resp = await api.get('/integrations/smartbill/company-lookup', { params: { cui: cui.trim() } });
      const data = resp.data || {};
      setClientName(String(data.name || ''));
      setClientAddress(String(data.address || ''));
      setClientCity(String(data.city || ''));
      const rawCounty = String(data.county || '').trim();
      const matchedCounty = RO_COUNTIES.find((j) => j.toLowerCase() === rawCounty.toLowerCase());
      setClientCounty(matchedCounty || '');
      setClientCountry('Romania');
      setClientVatCode(String(data.vatCode || ''));
      setIsTaxPayer(!!data.isTaxPayer);
      setClientStatus('found');
    } catch (err: any) {
      // Not in ANAF → treat as a brand new client to fill manually.
      setClientStatus('new');
      setClientVatCode(cui.trim());
      setError(err?.response?.data?.message || 'Compania nu a fost găsită în ANAF — completează datele manual pentru un client nou.');
    } finally {
      setLookupBusy(false);
    }
  };

  const canLeaveClient = clientName.trim().length > 0 && (clientType === 'person' || clientStatus !== 'idle');

  // ─── Product ─────────────────────────────────────────────────────────────

  // Autocomplete: search SmartBill stock as the user types the product name.
  useEffect(() => {
    if (step !== 'product' || !showResults) return;
    const term = productName.trim();
    if (term.length < 2) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    setSearchBusy(true);
    const t = setTimeout(async () => {
      try {
        const resp = await api.get('/integrations/smartbill/products', {
          params: { query: term },
        });
        if (!cancelled) setProductResults(Array.isArray(resp.data) ? resp.data : []);
      } catch {
        if (!cancelled) setProductResults([]);
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, step, showResults]);

  const pickProduct = (p: ProductResult) => {
    setProductName(p.name);
    if (p.measuringUnit) setMeasuringUnit(p.measuringUnit);
    setShowResults(false);
    setProductResults([]);
  };

  const canLeaveProduct = productName.trim().length > 0;

  // ─── Amount / create ────────────────────────────────────────────────────

  const total = (() => {
    const p = parseFloat(price);
    const q = parseFloat(quantity);
    if (Number.isNaN(p) || Number.isNaN(q)) return null;
    return p * q;
  })();

  const createInvoice = async () => {
    setError('');
    setSuccess('');
    if (!selectedSeries) return setError('Alege seria de facturare.');
    const priceNum = parseFloat(price);
    const qtyNum = parseFloat(quantity);
    if (Number.isNaN(priceNum) || priceNum < 0) return setError('Preț invalid.');
    if (Number.isNaN(qtyNum) || qtyNum <= 0) return setError('Cantitate invalidă.');

    setBusy(true);
    try {
      const resp = await api.post('/integrations/smartbill/invoices', {
        seriesName: selectedSeries,
        currency,
        client: {
          name: clientName.trim(),
          vatCode: clientType === 'company' ? clientVatCode.trim() || undefined : undefined,
          isTaxPayer: clientType === 'company' ? isTaxPayer : false,
          address: clientAddress.trim() || undefined,
          city: clientCity.trim() || undefined,
          county: clientCountry === 'Romania' ? (clientCounty.trim() || undefined) : undefined,
          email: clientEmail.trim() || undefined,
          country: clientCountry,
        },
        product: {
          name: productName.trim(),
          price: priceNum,
          quantity: qtyNum,
          measuringUnit: measuringUnit.trim() || 'buc',
          currency,
          isTaxIncluded: taxIncluded,
          taxPercentage: vatOption === 'normal' ? 21 : vatOption === 'redus' ? 11 : 0,
          taxName: vatOption === 'normal' ? 'Normala' : vatOption === 'redus' ? 'Redusa' : undefined,
          isService,
        },
      });
      const data = resp.data || {};
      setCreated({ series: String(data.series || selectedSeries), number: String(data.number || '') });
      setSuccess(`Factura ${data.series || selectedSeries}${data.number || ''} a fost creată în SmartBill.`);
      setStep('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Crearea facturii a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const sendByEmail = async () => {
    if (!created) return;
    setError('');
    setSendBusy(true);
    try {
      await api.post('/integrations/smartbill/invoices/send', {
        series: created.series,
        number: created.number,
        to: clientEmail.trim() || undefined,
      });
      setSuccess(`Factura ${created.series}${created.number} a fost trimisă pe email${clientEmail ? ` la ${clientEmail}` : ''}.`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Trimiterea pe email a eșuat.');
    } finally {
      setSendBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!created) return;
    try {
      const resp = await api.get('/integrations/smartbill/invoices/pdf', {
        params: { series: created.series, number: created.number },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('Nu am putut descărca PDF-ul.');
    }
  };

  if (!open) return null;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Factură nouă (SmartBill)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {/* Stepper */}
        {connected && step !== 'done' && (
          <div className="flex items-center justify-center gap-2 px-5 pt-4">
            {STEPS.map((s, i) => {
              const active = i === stepIndex;
              const done = i < stepIndex;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    active ? 'bg-emerald-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                      active ? 'bg-white text-emerald-700' : done ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-white'
                    }`}>{done ? '✓' : i + 1}</span>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && <span className="text-gray-300">→</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="p-5 space-y-4">
          {connected === false && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              SmartBill nu este conectat. Mergi în Integrations → SmartBill și completează API Token, Email și Company VAT.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
          )}
          {success && step !== 'done' && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{success}</div>
          )}

          {/* ── STEP: CLIENT ── */}
          {connected && step === 'client' && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-800">Tip client</span>
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" checked={clientType === 'company'} onChange={() => { setClientType('company'); setClientStatus('idle'); }} /> Companie
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="radio" checked={clientType === 'person'} onChange={() => { setClientType('person'); setClientStatus('new'); }} /> Persoană fizică
                </label>
              </div>

              {clientType === 'company' && (
                <>
                  <div className="flex gap-2">
                    <input
                      value={cui}
                      onChange={(e) => setCui(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && lookupCompany()}
                      placeholder="CUI (ex: 12345678 sau RO12345678)"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={lookupCompany}
                      disabled={lookupBusy}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {lookupBusy ? 'Caut...' : 'Caută client'}
                    </button>
                  </div>

                  {clientStatus === 'found' && (
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                      ✓ Client găsit în ANAF — verifică datele și continuă.
                    </div>
                  )}
                  {clientStatus === 'new' && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      Client nou — completează datele. Se va crea automat în SmartBill la emiterea facturii.
                    </div>
                  )}
                  {clientStatus === 'idle' && (
                    <button
                      onClick={() => { setError(''); setClientStatus('new'); setClientVatCode(cui.trim()); }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Sau completează datele manual →
                    </button>
                  )}
                </>
              )}

              {(clientStatus !== 'idle' || clientType === 'person') && (
                <div className="space-y-2">
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nume client" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Email client (pentru trimitere)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  {clientType === 'company' && (
                    <input value={clientVatCode} onChange={(e) => setClientVatCode(e.target.value)} placeholder="CUI / Cod fiscal" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  )}
                  <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Adresă (stradă, nr.)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={clientCity} onChange={(e) => setClientCity(e.target.value)} placeholder="Localitate" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <select value={clientCountry} onChange={(e) => setClientCountry(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {clientCountry === 'Romania' && (
                    <select value={clientCounty} onChange={(e) => setClientCounty(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
                      <option value="">Județ...</option>
                      {RO_COUNTIES.map((j) => <option key={j} value={j}>{j}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: PRODUCT ── */}
          {connected && step === 'product' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="relative">
                  <input
                    value={productName}
                    onChange={(e) => { setProductName(e.target.value); setShowResults(true); }}
                    onFocus={() => setShowResults(true)}
                    placeholder="Nume produs / serviciu (ex: Consultanță nutrițională)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                  {showResults && (searchBusy || productResults.length > 0) && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-44 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg divide-y">
                      {searchBusy && productResults.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-400">Caut în SmartBill...</div>
                      )}
                      {productResults.map((p) => (
                        <button key={`${p.name}-${p.code || ''}`} onClick={() => pickProduct(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50">
                          {p.name}{p.code ? ` · ${p.code}` : ''}{p.measuringUnit ? ` · ${p.measuringUnit}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <label className="block text-[11px] text-gray-500 mb-1">Unitate de măsură</label>
                    <input value={measuringUnit} onChange={(e) => setMeasuringUnit(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                  </div>
                  <label className="flex items-center gap-1 mt-4">
                    <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} /> Serviciu
                  </label>
                </div>
                <p className="text-[11px] text-gray-400">Scrie numele — dacă există în SmartBill apare în listă, altfel continuă cu ce ai scris (se salvează automat la emitere).</p>
              </div>
            </div>
          )}

          {/* ── STEP: AMOUNT ── */}
          {connected && step === 'amount' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Serie facturare</label>
                <select value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {series.length === 0 && <option value="">(nicio serie găsită)</option>}
                  {series.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}{s.nextNumber ? ` (următorul: ${s.nextNumber})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-600 space-y-1">
                <div><span className="text-gray-400">Client:</span> {clientName || '-'}</div>
                <div><span className="text-gray-400">Produs:</span> {productName || '-'}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Preț</label>
                  <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Cantitate</label>
                  <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">TVA</label>
                  <select value={vatOption} onChange={(e) => setVatOption(e.target.value as 'normal' | 'redus' | 'none')} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white">
                    <option value="normal">Normală (21%)</option>
                    <option value="redus">Redusă (11%)</option>
                    <option value="none">Fără TVA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Monedă</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm">
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={taxIncluded} onChange={(e) => setTaxIncluded(e.target.checked)} /> Preț cu TVA inclus
              </label>
              {total !== null && (
                <div className="text-sm text-gray-700">Total: <span className="font-semibold">{total.toFixed(2)} {currency}</span></div>
              )}
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && created && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                ✓ Factura <span className="font-semibold">{created.series}{created.number}</span> a fost creată în SmartBill.
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={sendByEmail} disabled={sendBusy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                  {sendBusy ? 'Se trimite...' : `Trimite pe email${clientEmail ? ` (${clientEmail})` : ''}`}
                </button>
                <button onClick={downloadPdf} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Descarcă PDF</button>
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm ml-auto">Închide</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {connected && step !== 'done' && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
            <button
              onClick={() => {
                if (step === 'product') setStep('client');
                else if (step === 'amount') setStep('product');
                else onClose();
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
            >
              {step === 'client' ? 'Anulează' : 'Înapoi'}
            </button>

            {step === 'client' && (
              <button onClick={() => { setError(''); setStep('product'); }} disabled={!canLeaveClient} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                Continuă la produs
              </button>
            )}
            {step === 'product' && (
              <button onClick={() => { setError(''); setStep('amount'); }} disabled={!canLeaveProduct} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                Continuă la sumă
              </button>
            )}
            {step === 'amount' && (
              <button onClick={createInvoice} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50">
                {busy ? 'Se creează...' : 'Creează factura'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
