import { useState } from 'react';
import { X } from 'lucide-react';
import { usePortfolio } from '../../context/PortfolioContext';
import { formatINR } from '../../utils/formatCurrency';

const today = () => new Date().toISOString().split('T')[0];

const UNIT = {
  stocks: { field: 'quantity', label: 'shares' },
  mutual_fund: { field: 'units', label: 'units' },
  gold: { field: 'grams', label: 'grams' },
};

function unitOf(inv) {
  if (UNIT[inv.type]) return UNIT[inv.type];
  if (inv.type === 'bonds' && inv.quantity > 0) return { field: 'quantity', label: 'bonds' };
  return null;
}

/**
 * Record a sale. This "books" the profit or loss that the Tax Centre then uses.
 * The purchase date is shown and editable on purpose: it decides whether the gain
 * is short-term or long-term, and a holding entered with the default (today's) date
 * would otherwise be mis-classified.
 */
export default function SellModal({ investment, onClose, onSold }) {
  const { sellInvestment } = usePortfolio();
  const unit = unitOf(investment);
  const held = unit ? investment[unit.field] : null;

  const [form, setForm] = useState({
    sellAll: true,
    quantity: '',
    saleDate: today(),
    salePrice: '',
    saleAmount: '',
    expenses: '',
    purchaseDate: investment.purchaseDate || '',
    fundCategory: investment.fundCategory || '',
    goldForm: '',
    bondListing: '',
    fmv: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const qty = unit ? (form.sellAll ? held : Number(form.quantity) || 0) : 1;
  const total = unit ? (Number(form.salePrice) || 0) * qty : Number(form.saleAmount) || 0;
  const isEquity = investment.type === 'stocks' || (investment.type === 'mutual_fund' && form.fundCategory === 'equity');
  const needsFmv = isEquity && form.purchaseDate && form.purchaseDate < '2018-02-01';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = { saleDate: form.saleDate, purchaseDate: form.purchaseDate, expenses: form.expenses };
    if (unit) {
      if (!form.sellAll) payload.quantity = form.quantity;
      payload.salePricePerUnit = form.salePrice;
    } else {
      payload.saleAmount = form.saleAmount;
    }
    if (investment.type === 'mutual_fund') payload.fundCategory = form.fundCategory;
    if (investment.type === 'gold') payload.goldForm = form.goldForm;
    if (investment.type === 'bonds') payload.bondListing = form.bondListing;
    if (needsFmv && form.fmv) payload.fmv31Jan2018PerUnit = form.fmv;

    setSubmitting(true);
    try {
      const res = await sellInvestment(investment.id, payload);
      onSold(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-label={`Sell ${investment.name}`}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Record a sale</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {investment.name}
              {unit && ` · you hold ${held} ${unit.label}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {unit && (
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.sellAll} onChange={(e) => update('sellAll', e.target.checked)} />
              Sell everything ({held} {unit.label})
            </label>
            {!form.sellAll && (
              <input required type="number" min="0" step="any" max={held} placeholder={`How many ${unit.label}?`}
                value={form.quantity} onChange={(e) => update('quantity', e.target.value)} className="input-field mt-2" />
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Sale date *">
            <input required type="date" max={today()} min="2024-07-23" value={form.saleDate}
              onChange={(e) => update('saleDate', e.target.value)} className="input-field" />
          </Field>
          {unit ? (
            <Field label={`Sale price per ${unit.label.replace(/s$/, '')} (₹) *`}>
              <input required type="number" min="0" step="any" value={form.salePrice}
                onChange={(e) => update('salePrice', e.target.value)} className="input-field" placeholder="3000" />
            </Field>
          ) : (
            <Field label="Total amount received (₹) *">
              <input required type="number" min="0" step="any" value={form.saleAmount}
                onChange={(e) => update('saleAmount', e.target.value)} className="input-field" />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Brokerage / expenses (₹)">
            <input type="number" min="0" step="any" value={form.expenses}
              onChange={(e) => update('expenses', e.target.value)} className="input-field" placeholder="0" />
          </Field>
          <Field label="Purchase date *">
            <input required type="date" max={today()} value={form.purchaseDate}
              onChange={(e) => update('purchaseDate', e.target.value)} className="input-field" />
          </Field>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          The purchase date decides short-term vs long-term tax — please make sure it is the date you actually bought
          this. STT is not deductible.
        </p>

        {investment.type === 'mutual_fund' && (
          <Field label="Fund category *">
            <select required value={form.fundCategory} onChange={(e) => update('fundCategory', e.target.value)} className="input-field">
              <option value="">Select…</option>
              <option value="equity">Equity-oriented (65%+ in Indian equity)</option>
              <option value="debt">Debt (65%+ in debt &amp; money market)</option>
              <option value="other">Other (hybrid, international, gold/silver fund)</option>
            </select>
          </Field>
        )}
        {investment.type === 'gold' && (
          <Field label="Type of gold *">
            <select required value={form.goldForm} onChange={(e) => update('goldForm', e.target.value)} className="input-field">
              <option value="">Select…</option>
              <option value="physical">Physical / digital gold / gold fund</option>
              <option value="etf">Gold ETF (listed)</option>
              <option value="sgb_exchange">Sovereign Gold Bond sold on exchange</option>
              <option value="sgb_maturity">Sovereign Gold Bond redeemed at maturity</option>
            </select>
          </Field>
        )}
        {investment.type === 'bonds' && (
          <Field label="Bond listing *">
            <select required value={form.bondListing} onChange={(e) => update('bondListing', e.target.value)} className="input-field">
              <option value="">Select…</option>
              <option value="listed">Listed on an exchange</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </Field>
        )}
        {needsFmv && (
          <Field label="Price on 31 Jan 2018 (₹ per unit)">
            <input type="number" min="0" step="any" value={form.fmv} onChange={(e) => update('fmv', e.target.value)}
              className="input-field" placeholder="Highest traded price / NAV on 31 Jan 2018" />
            <p className="text-xs text-gray-500 mt-1">Bought before 1 Feb 2018 — needed to work out the grandfathered cost.</p>
          </Field>
        )}

        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 text-sm">
          <span className="text-gray-500">Total sale value</span>
          <span className="font-semibold text-gray-900">{formatINR(total)}</span>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1 disabled:opacity-60">
            {submitting ? 'Saving…' : 'Record sale'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
