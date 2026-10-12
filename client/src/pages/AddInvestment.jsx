import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Info, Search, X } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { INVESTMENT_TYPES } from '../data/investmentTypes';
import { api } from '../services/api';

const today = () => new Date().toISOString().split('T')[0];

const initialForm = {
  type: '',
  name: '',
  // stocks
  symbol: '',
  exchange: 'NSE',
  quantity: '',
  // mutual funds
  schemeCode: '',
  units: '',
  folio: '',
  fundCategory: '',
  sipAmount: '',
  sipDate: '',
  // shared
  invested: '',
  purchaseDate: today(),
  // fixed deposit
  bank: '',
  rate: '',
  tenureMonths: '',
  maturityDate: '',
  // gold
  grams: '',
  purity: '24',
  series: '',
  // real estate
  location: '',
  area: '',
  current: '',
  appreciationRate: '',
  // bonds
  issuer: '',
  faceValue: '',
  couponRate: '',
};

// Which form fields are sent for each investment type (blank ones are dropped).
const FIELDS_BY_TYPE = {
  stocks: ['name', 'symbol', 'exchange', 'quantity', 'invested', 'purchaseDate'],
  mutual_fund: ['name', 'schemeCode', 'units', 'invested', 'folio', 'fundCategory', 'sipAmount', 'sipDate', 'purchaseDate'],
  fixed_deposit: ['name', 'bank', 'invested', 'rate', 'purchaseDate', 'tenureMonths', 'maturityDate'],
  gold: ['name', 'series', 'grams', 'invested', 'purity', 'purchaseDate'],
  real_estate: ['name', 'location', 'area', 'invested', 'current', 'appreciationRate', 'purchaseDate'],
  bonds: ['name', 'issuer', 'invested', 'current', 'faceValue', 'quantity', 'couponRate', 'maturityDate', 'purchaseDate'],
};

const AUTO_PRICING_NOTE = {
  stocks: 'The live NSE/BSE price is fetched automatically and refreshed every day. You only enter this once.',
  mutual_fund: 'The latest NAV is fetched automatically and refreshed every day. You only enter this once.',
  fixed_deposit: 'The accrued value (quarterly compounding) is calculated and updated every day.',
  gold: 'The value is updated every day from the gold price in ₹ per gram.',
  real_estate: 'Property has no live price. Enter the current value yourself, or set an expected yearly appreciation to have it grow daily.',
  bonds: 'Add face value, quantity and coupon rate to have accrued interest added daily; otherwise enter the current value yourself.',
};

export default function AddInvestment() {
  const navigate = useNavigate();
  const { addInvestment } = usePortfolio();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [success, setSuccess] = useState(null); // { warning }
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.type === 'mutual_fund' && !form.schemeCode) {
      setError('Search for your fund and select it from the list.');
      return;
    }

    const payload = { type: form.type };
    for (const field of FIELDS_BY_TYPE[form.type]) {
      if (form[field] !== '') payload[field] = form[field];
    }

    setSubmitting(true);
    try {
      const res = await addInvestment(payload);
      setSuccess({ warning: res.warning });
      setTimeout(() => navigate('/investments'), res.warning ? 3500 : 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <CheckCircle className="w-16 h-16 text-groww-green mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Investment Added!</h2>
        {success.warning && <p className="text-amber-600 text-sm mt-2 max-w-sm">{success.warning}</p>}
        <p className="text-gray-500 mt-2">Redirecting to portfolio...</p>
      </div>
    );
  }

  const typeInfo = INVESTMENT_TYPES[form.type];
  const t = form.type;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Investment</h1>
          <p className="text-sm text-gray-500">Step {step} of 2</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-groww-green' : 'bg-gray-200'}`} />
        <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-groww-green' : 'bg-gray-200'}`} />
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">Select investment type</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.values(INVESTMENT_TYPES).map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  update('type', type.id);
                  setError('');
                  setStep(2);
                }}
                className={`card p-4 text-left hover:shadow-hover transition-all ${
                  form.type === type.id ? 'ring-2 ring-groww-green' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center" style={{ backgroundColor: type.bgColor }}>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }} />
                </div>
                <p className="font-semibold text-sm text-gray-900">{type.label}</p>
                <p className="text-xs text-gray-500 mt-1">{type.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: typeInfo?.bgColor }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: typeInfo?.color }} />
            </div>
            <span className="font-medium text-sm">{typeInfo?.label}</span>
            <button type="button" onClick={() => setStep(1)} className="ml-auto text-xs text-groww-green hover:underline">
              Change type
            </button>
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-600 bg-groww-green/10 rounded-xl px-3 py-2.5">
            <Info className="w-4 h-4 text-groww-green flex-shrink-0 mt-px" />
            {AUTO_PRICING_NOTE[t]}
          </p>

          {/* ---------------- Stocks ---------------- */}
          {t === 'stocks' && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Field label="NSE / BSE symbol *" className="col-span-2">
                  <input required value={form.symbol} onChange={(e) => update('symbol', e.target.value.toUpperCase())}
                    placeholder="RELIANCE" className="input-field" autoCapitalize="characters" />
                </Field>
                <Field label="Exchange">
                  <select value={form.exchange} onChange={(e) => update('exchange', e.target.value)} className="input-field">
                    <option>NSE</option>
                    <option>BSE</option>
                  </select>
                </Field>
              </div>
              <Field label="Company name (optional)">
                <input value={form.name} onChange={(e) => update('name', e.target.value)}
                  placeholder="Reliance Industries" className="input-field" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Quantity *">
                  <NumberInput required value={form.quantity} onChange={(v) => update('quantity', v)} placeholder="10" />
                </Field>
                <Field label="Total amount invested (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="25000" />
                </Field>
              </div>
            </>
          )}

          {/* ---------------- Mutual funds ---------------- */}
          {t === 'mutual_fund' && (
            <>
              <FundPicker
                selectedName={form.name}
                selectedCode={form.schemeCode}
                onSelect={(fund) => {
                  update('schemeCode', fund.schemeCode);
                  update('name', fund.name);
                }}
                onClear={() => {
                  update('schemeCode', '');
                  update('name', '');
                }}
              />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Units held *">
                  <NumberInput required step="0.001" value={form.units} onChange={(v) => update('units', v)} placeholder="450.5" />
                </Field>
                <Field label="Total amount invested (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="28000" />
                </Field>
              </div>
              <Field label="Fund category (needed for tax when you sell)">
                <select value={form.fundCategory} onChange={(e) => update('fundCategory', e.target.value)} className="input-field">
                  <option value="">Not sure / choose later</option>
                  <option value="equity">Equity-oriented (65%+ in Indian equity)</option>
                  <option value="debt">Debt (65%+ in debt &amp; money market)</option>
                  <option value="other">Other (hybrid, international, gold/silver fund)</option>
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Folio (optional)">
                  <input value={form.folio} onChange={(e) => update('folio', e.target.value)} className="input-field" />
                </Field>
                <Field label="SIP amount (₹)">
                  <NumberInput value={form.sipAmount} onChange={(v) => update('sipAmount', v)} placeholder="5000" />
                </Field>
                <Field label="SIP date (1-31)">
                  <NumberInput min="1" max="31" step="1" value={form.sipDate} onChange={(v) => update('sipDate', v)} placeholder="5" />
                </Field>
              </div>
            </>
          )}

          {/* ---------------- Fixed deposit ---------------- */}
          {t === 'fixed_deposit' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name *">
                  <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="HDFC Bank FD" className="input-field" />
                </Field>
                <Field label="Bank (optional)">
                  <input value={form.bank} onChange={(e) => update('bank', e.target.value)} placeholder="HDFC Bank" className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Principal (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="500000" />
                </Field>
                <Field label="Interest rate (% p.a.) *">
                  <NumberInput required step="0.01" value={form.rate} onChange={(v) => update('rate', v)} placeholder="7.25" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tenure (months)">
                  <NumberInput step="1" min="1" value={form.tenureMonths} onChange={(v) => update('tenureMonths', v)} placeholder="36" />
                </Field>
                <Field label="…or maturity date">
                  <input type="date" value={form.maturityDate} onChange={(e) => update('maturityDate', e.target.value)} className="input-field" />
                </Field>
              </div>
            </>
          )}

          {/* ---------------- Gold ---------------- */}
          {t === 'gold' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name *">
                  <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Sovereign Gold Bond" className="input-field" />
                </Field>
                <Field label="Series (optional)">
                  <input value={form.series} onChange={(e) => update('series', e.target.value)} placeholder="2024-25 Series I" className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Weight (grams) *">
                  <NumberInput required step="0.001" value={form.grams} onChange={(v) => update('grams', v)} placeholder="10" />
                </Field>
                <Field label="Amount invested (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="62500" />
                </Field>
                <Field label="Purity">
                  <select value={form.purity} onChange={(e) => update('purity', e.target.value)} className="input-field">
                    <option value="24">24K (999)</option>
                    <option value="22">22K (916)</option>
                    <option value="18">18K (750)</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {/* ---------------- Real estate ---------------- */}
          {t === 'real_estate' && (
            <>
              <Field label="Name *">
                <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="2BHK Apartment - Pune" className="input-field" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Location (optional)">
                  <input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="Hinjewadi, Pune" className="input-field" />
                </Field>
                <Field label="Area (optional)">
                  <input value={form.area} onChange={(e) => update('area', e.target.value)} placeholder="850 sq ft" className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Purchase price (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="4500000" />
                </Field>
                <Field label="Current value (₹)">
                  <NumberInput value={form.current} onChange={(v) => update('current', v)} placeholder="Same as purchase" />
                </Field>
                <Field label="Appreciation (% p.a.)">
                  <NumberInput step="0.1" value={form.appreciationRate} onChange={(v) => update('appreciationRate', v)} placeholder="Optional" />
                </Field>
              </div>
            </>
          )}

          {/* ---------------- Bonds ---------------- */}
          {t === 'bonds' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name *">
                  <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="7.18% GOI Savings Bond" className="input-field" />
                </Field>
                <Field label="Issuer (optional)">
                  <input value={form.issuer} onChange={(e) => update('issuer', e.target.value)} placeholder="Government of India" className="input-field" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount invested (₹) *">
                  <NumberInput required value={form.invested} onChange={(v) => update('invested', v)} placeholder="100000" />
                </Field>
                <Field label="Current value (₹)">
                  <NumberInput value={form.current} onChange={(v) => update('current', v)} placeholder="Same as invested" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Face value (₹)">
                  <NumberInput value={form.faceValue} onChange={(v) => update('faceValue', v)} placeholder="1000" />
                </Field>
                <Field label="Quantity">
                  <NumberInput value={form.quantity} onChange={(v) => update('quantity', v)} placeholder="100" />
                </Field>
                <Field label="Coupon (% p.a.)">
                  <NumberInput step="0.01" value={form.couponRate} onChange={(v) => update('couponRate', v)} placeholder="7.18" />
                </Field>
              </div>
              <Field label="Maturity date (optional)">
                <input type="date" value={form.maturityDate} onChange={(e) => update('maturityDate', e.target.value)} className="input-field" />
              </Field>
            </>
          )}

          <Field label={t === 'fixed_deposit' ? 'Start date *' : 'Purchase date'}>
            <input type="date" required={t === 'fixed_deposit'} max={today()} value={form.purchaseDate}
              onChange={(e) => update('purchaseDate', e.target.value)} className="input-field" />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
            {submitting ? 'Adding…' : 'Add to Portfolio'}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, min = '0', step = 'any', ...rest }) {
  return (
    <input type="number" inputMode="decimal" min={min} step={step} value={value}
      onChange={(e) => onChange(e.target.value)} className="input-field" {...rest} />
  );
}

/**
 * Search-as-you-type mutual fund picker. Funds are identified by AMFI scheme
 * code, so the user picks the exact plan (Direct/Regular, Growth/IDCW) instead
 * of typing a code we would have to guess.
 */
function FundPicker({ selectedName, selectedCode, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    if (selectedCode || query.trim().length < 3) {
      setResults([]);
      setSearchError('');
      return undefined;
    }
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await api.searchFunds(query.trim());
        if (id === latest.current) setResults(res.results);
      } catch (e) {
        if (id === latest.current) setSearchError(e.message);
      } finally {
        if (id === latest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, selectedCode]);

  if (selectedCode) {
    return (
      <Field label="Mutual fund *">
        <div className="flex items-center gap-3 border border-groww-green/40 bg-groww-green/5 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{selectedName}</p>
            <p className="text-xs text-gray-500">Scheme code {selectedCode}</p>
          </div>
          <button type="button" onClick={onClear} aria-label="Change fund" className="p-1.5 rounded-lg hover:bg-white">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </Field>
    );
  }

  return (
    <Field label="Search your mutual fund *">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Parag Parikh Flexi Cap Direct Growth" className="input-field pl-10" />
      </div>
      {searching && <p className="text-xs text-gray-400 mt-2">Searching…</p>}
      {searchError && <p className="text-xs text-red-500 mt-2">{searchError}</p>}
      {!searching && !searchError && query.trim().length >= 3 && results.length === 0 && (
        <p className="text-xs text-gray-400 mt-2">No funds found. Try fewer words.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50 bg-white">
          {results.map((fund) => (
            <li key={fund.schemeCode}>
              <button type="button" onClick={() => { onSelect(fund); setQuery(''); }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                <p className="text-sm text-gray-900">{fund.name}</p>
                <p className="text-[11px] text-gray-400">Scheme code {fund.schemeCode}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
