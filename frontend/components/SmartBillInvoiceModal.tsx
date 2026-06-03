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

interface Props {
  open: boolean;
  onClose: () => void;
  defaultClientName?: string;
  defaultClientEmail?: string;
}

export default function SmartBillInvoiceModal({
  open,
  onClose,
  defaultClientName,
  defaultClientEmail,
}: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [selectedSeries, setSelectedSeries] = useState('');

  const [clientType, setClientType] = useState<ClientType>('company');
  const [cui, setCui] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientVatCode, setClientVatCode] = useState('');
  const [isTaxPayer, setIsTaxPayer] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [productName, setProductName] = useState('');
  const [measuringUnit, setMeasuringUnit] = useState('buc');
  const [isService, setIsService] = useState(true);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [vatPercentage, setVatPercentage] = useState('21');
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
    setClientType('company');
    setCui('');
    setClientName(defaultClientName || '');
    setClientEmail(defaultClientEmail || '');
    setClientAddress('');
    setClientVatCode('');
    setIsTaxPayer(false);
    setProductQuery('');
    setProductResults([]);
    setProductName('');
    setMeasuringUnit('buc');
    setIsService(true);
    setPrice('');
    setQuantity('1');
    setVatPercentage('21');
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
      setClientVatCode(String(data.vatCode || ''));
      setIsTaxPayer(!!data.isTaxPayer);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Compania nu a fost găsită în ANAF.');
    } finally {
      setLookupBusy(false);
    }
  };

  const searchProducts = async () => {
    setSearchBusy(true);
    setError('');
    try {
      const resp = await api.get('/integrations/smartbill/products', {
        params: { query: productQuery.trim() || undefined },
      });
      setProductResults(Array.isArray(resp.data) ? resp.data : []);
    } catch (err: any) {
      setProductResults([]);
    } finally {
      setSearchBusy(false);
    }
  };

  const pickProduct = (p: ProductResult) => {
    setProductName(p.name);
    if (p.measuringUnit) setMeasuringUnit(p.measuringUnit);
  };

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
    if (!clientName.trim()) return setError('Completează numele clientului.');
    if (!productName.trim()) return setError('Completează produsul.');
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
          email: clientEmail.trim() || undefined,
          country: 'Romania',
        },
        product: {
          name: productName.trim(),
          price: priceNum,
          quantity: qtyNum,
          measuringUnit: measuringUnit.trim() || 'buc',
          currency,
          isTaxIncluded: taxIncluded,
          taxPercentage: parseFloat(vatPercentage) || 0,
          isService,
        },
      });
      const data = resp.data || {};
      setCreated({ series: String(data.series || selectedSeries), number: String(data.number || '') });
      setSuccess(`Factura ${data.series || selectedSeries}${data.number || ''} a fost creată în SmartBill.`);
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
    } catch (err: any) {
      setError('Nu am putut descărca PDF-ul.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Factură nouă (SmartBill)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          {connected === false && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              SmartBill nu este conectat. Mergi în Integrations → SmartBill și completează API Token, Email și Company VAT.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{success}</div>
          )}

          {connected && !created && (
            <>
              {/* Series */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Serie facturare</label>
                <select
                  value={selectedSeries}
                  onChange={(e) => setSelectedSeries(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {series.length === 0 && <option value="">(nicio serie găsită)</option>}
                  {series.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}{s.nextNumber ? ` (următorul: ${s.nextNumber})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Client */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-gray-800">Client</span>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={clientType === 'company'} onChange={() => setClientType('company')} /> Companie
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={clientType === 'person'} onChange={() => setClientType('person')} /> Persoană fizică
                  </label>
                </div>

                {clientType === 'company' && (
                  <div className="flex gap-2">
                    <input
                      value={cui}
                      onChange={(e) => setCui(e.target.value)}
                      placeholder="CUI (ex: 12345678 sau RO12345678)"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={lookupCompany}
                      disabled={lookupBusy}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {lookupBusy ? 'Caut...' : 'Caută ANAF'}
                    </button>
                  </div>
                )}

                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nume client"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="Email client (pentru trimitere)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {clientType === 'company' && (
                  <input
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="Adresă"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>

              {/* Product */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <span className="text-sm font-semibold text-gray-800">Produs / serviciu</span>
                <div className="flex gap-2">
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
                    placeholder="Caută în SmartBill..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={searchProducts}
                    disabled={searchBusy}
                    className="px-3 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-black disabled:opacity-50"
                  >
                    {searchBusy ? '...' : 'Caută'}
                  </button>
                </div>
                {productResults.length > 0 && (
                  <div className="max-h-32 overflow-auto border border-gray-100 rounded-lg divide-y">
                    {productResults.map((p) => (
                      <button
                        key={`${p.name}-${p.code || ''}`}
                        onClick={() => pickProduct(p)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                      >
                        {p.name}{p.code ? ` · ${p.code}` : ''}{p.measuringUnit ? ` · ${p.measuringUnit}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Nume produs (sau scrie unul nou)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
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
                    <label className="block text-[11px] text-gray-500 mb-1">TVA %</label>
                    <input value={vatPercentage} onChange={(e) => setVatPercentage(e.target.value)} type="number" min="0" step="1" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">U.M.</label>
                    <input value={measuringUnit} onChange={(e) => setMeasuringUnit(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={taxIncluded} onChange={(e) => setTaxIncluded(e.target.checked)} /> Preț cu TVA inclus
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} /> Serviciu
                  </label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                {total !== null && (
                  <div className="text-sm text-gray-700">Total: <span className="font-semibold">{total.toFixed(2)} {currency}</span></div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Anulează</button>
                <button
                  onClick={createInvoice}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? 'Se creează...' : 'Creează factura'}
                </button>
              </div>
            </>
          )}

          {created && (
            <div className="space-y-4">
              <div className="text-sm text-gray-700">
                Factura <span className="font-semibold">{created.series}{created.number}</span> este în SmartBill.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={sendByEmail}
                  disabled={sendBusy}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendBusy ? 'Se trimite...' : `Trimite pe email${clientEmail ? ` (${clientEmail})` : ''}`}
                </button>
                <button onClick={downloadPdf} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
                  Descarcă PDF
                </button>
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm ml-auto">
                  Închide
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
