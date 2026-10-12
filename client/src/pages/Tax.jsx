import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Download, Lightbulb, Undo2 } from 'lucide-react';
import { api } from '../services/api';
import { usePortfolio } from '../context/PortfolioContext';
import { formatINR } from '../utils/formatCurrency';
import { longDate } from '../utils/history';

const FIRST_FY = 2024; // rules in force from 23 Jul 2024 (FY 2024-25)

const fyLabel = (start) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;

function currentFyStart() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

const TERM_STYLE = {
  long: 'bg-blue-50 text-blue-700',
  short: 'bg-orange-50 text-orange-700',
  exempt: 'bg-gray-100 text-gray-600',
};
const TERM_LABEL = { long: 'Long-term', short: 'Short-term', exempt: 'Exempt' };

export default function Tax() {
  const { reload } = usePortfolio();
  const startNow = currentFyStart();
  const options = [];
  for (let y = startNow; y >= FIRST_FY; y -= 1) options.push(fyLabel(y));

  const [fy, setFy] = useState(fyLabel(startNow));
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (year) => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.taxReport(year));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(fy);
  }, [fy, load]);

  const handleUndo = async (sale) => {
    if (!window.confirm(`Undo the sale of "${sale.name}"? The holding will be restored to your portfolio.`)) return;
    try {
      await api.undoSale(sale.saleId);
      await Promise.all([load(fy), reload()]);
    } catch (e) {
      window.alert(e.message);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.downloadTaxCsv(fy);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Centre</h1>
          <p className="text-sm text-gray-500 mt-1">Capital gains on the profits you have booked, and the tax to pay</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500" htmlFor="fy">Financial year</label>
          <select id="fy" value={fy} onChange={(e) => setFy(e.target.value)} className="input-field !w-auto !py-2">
            {options.map((o) => (
              <option key={o} value={o}>FY {o}</option>
            ))}
          </select>
          <button onClick={handleExport} disabled={exporting || !report?.sales.length}
            title="Download capital-gains statement (CSV) for your CA"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-groww-green text-sm font-medium text-gray-600 disabled:opacity-50">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export'}</span>
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>{report?.disclaimer || 'This is an estimate, not tax advice. Confirm with a Chartered Accountant.'}</span>
      </p>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
      {loading && !report && <p className="text-sm text-gray-400">Loading…</p>}

      {report && (
        <>
          <SettingsCard key={fy} report={report} fy={fy} onSaved={setReport} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Net realised gain" value={formatINR(report.summary.netGain, { showSign: true })}
              tone={report.summary.netGain >= 0 ? 'gain' : 'loss'} hint={`${report.summary.saleCount} sale${report.summary.saleCount === 1 ? '' : 's'}`} />
            <Stat label="Estimated tax" value={formatINR(report.tax.payable)} hint="incl. 4% cess" strong />
            <Stat label="Equity LTCG exemption left" value={formatINR(report.tax.exemptionRemaining)} hint={`of ₹1,25,000 (${formatINR(report.tax.exemptionUsed)} used)`} />
            <Stat label="Losses to carry forward" value={formatINR(report.tax.carryForward.shortTerm + report.tax.carryForward.longTerm)}
              hint={report.tax.carryForward.shortTerm + report.tax.carryForward.longTerm > 0 ? 'usable for 8 years' : 'none'} />
          </div>

          {report.warnings.length > 0 && (
            <div className="card space-y-2 border-amber-100">
              <h3 className="font-semibold text-gray-900 text-sm">Things to check</h3>
              <ul className="space-y-1.5">
                {report.warnings.map((w) => (
                  <li key={w} className="text-xs text-amber-700 flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AdvanceTax advance={report.advanceTax} fy={fy} />
          <Breakdown report={report} />
          <Sales report={report} onUndo={handleUndo} />
          {report.planning && <Planning planning={report.planning} />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Stat({ label, value, hint, tone, strong }) {
  const color = tone === 'gain' ? 'text-groww-gain' : tone === 'loss' ? 'text-groww-loss' : 'text-gray-900';
  return (
    <div className={`card ${strong ? 'ring-1 ring-groww-green/30' : ''}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SettingsCard({ report, fy, onSaved }) {
  const s = report.settings;
  const [slabRate, setSlabRate] = useState(String(s.slabRate));
  const [surcharge, setSurcharge] = useState(String(s.surchargePercent));
  const [paid, setPaid] = useState(String(s.advanceTaxPaid || ''));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      onSaved(await api.saveTaxSettings(fy, { slabRate, surchargePercent: surcharge, advanceTaxPaid: paid || 0 }));
      setMsg('Saved');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="card">
      <h3 className="font-semibold text-gray-900 mb-1">Your tax details for FY {fy}</h3>
      <p className="text-xs text-gray-500 mb-4">
        Short-term gains on debt funds, gold, property etc. are taxed at your income-tax slab rate.
        {s.isDefault && ' You have not set yours yet — 30% is assumed.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="slab">Slab rate</label>
          <select id="slab" value={slabRate} onChange={(e) => setSlabRate(e.target.value)} className="input-field">
            {[0, 5, 10, 15, 20, 25, 30].map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="surcharge">Surcharge</label>
          <select id="surcharge" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className="input-field">
            {[0, 10, 15, 25, 37].map((r) => <option key={r} value={r}>{r === 0 ? 'None (income ≤ ₹50L)' : `${r}%`}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="paid">Tax already paid on gains (₹)</label>
          <input id="paid" type="number" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)}
            className="input-field" placeholder="Advance tax / TDS" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {msg && <p className="text-xs text-gray-500 mt-2" role="status">{msg}</p>}
    </form>
  );
}

function AdvanceTax({ advance, fy }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="w-5 h-5 text-groww-green" />
        <h3 className="font-semibold text-gray-900">Paying the tax</h3>
      </div>

      {advance.fyEnded ? (
        <p className="text-sm text-gray-700">
          FY {fy} has ended.{' '}
          {advance.selfAssessmentDue > 0
            ? <>Unpaid tax of <b>{formatINR(advance.selfAssessmentDue)}</b> should be paid as self-assessment tax (challan 280) before you file your return; interest under 234B/234C may apply.</>
            : 'No further tax is due on these gains based on what you have entered.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-500">Tax on gains so far</p>
              <p className="font-bold text-gray-900">{formatINR(advance.taxOnGainsToDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Already paid</p>
              <p className="font-bold text-gray-900">{formatINR(advance.paid)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pay {advance.nextDueDate ? `by ${longDate(advance.nextDueDate)}` : 'now'}</p>
              <p className={`font-bold ${advance.balanceNow > 0 ? 'text-groww-loss' : 'text-groww-gain'}`}>{formatINR(advance.balanceNow)}</p>
            </div>
          </div>
          {advance.belowThreshold && (
            <p className="text-xs text-gray-500 mb-3">
              Estimated tax is below ₹{advance.threshold.toLocaleString('en-IN')}, so advance tax is not compulsory (this assumes you have no other tax liability).
            </p>
          )}
        </>
      )}

      {advance.schedule.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Due date</th>
                <th className="py-2 font-medium text-right">Total tax due by then</th>
                <th className="py-2 font-medium text-right">This instalment</th>
              </tr>
            </thead>
            <tbody>
              {advance.schedule.map((row) => (
                <tr key={row.dueDate} className={`border-b border-gray-50 ${row.status === 'past' ? 'text-gray-400' : 'text-gray-800'}`}>
                  <td className="py-2">{longDate(row.dueDate)}</td>
                  <td className="py-2 text-right">{formatINR(row.cumulativeDue)}</td>
                  <td className="py-2 text-right font-medium">{formatINR(row.instalmentDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">
        Tax on a gain is due by the next instalment date after you book it. Gains booked after an instalment date can be paid in the
        remaining instalments (last date 31 March) without interest.
      </p>
    </div>
  );
}

function Breakdown({ report }) {
  const lines = report.tax.lines.filter((l) => l.netGain !== 0);
  if (!lines.length) return null;
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">How the tax is worked out</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium">Category</th>
              <th className="py-2 font-medium text-right">Net gain / loss</th>
              <th className="py-2 font-medium text-right">Taxable</th>
              <th className="py-2 font-medium text-right">Rate</th>
              <th className="py-2 font-medium text-right">Tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.taxClass} className="border-b border-gray-50">
                <td className="py-2 pr-2">{l.label}</td>
                <td className="py-2 text-right">{formatINR(l.netGain, { showSign: true })}</td>
                <td className="py-2 text-right">{formatINR(l.taxableGain)}</td>
                <td className="py-2 text-right">{l.rate}%</td>
                <td className="py-2 text-right font-medium">{formatINR(l.tax)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-gray-600">
            {report.tax.exemptionUsed > 0 && (
              <tr><td colSpan={4} className="pt-2">Equity LTCG exemption applied</td><td className="pt-2 text-right">−{formatINR(report.tax.exemptionUsed)} of gain</td></tr>
            )}
            {report.tax.surcharge > 0 && (
              <tr><td colSpan={4}>Surcharge</td><td className="text-right">{formatINR(report.tax.surcharge)}</td></tr>
            )}
            <tr><td colSpan={4}>Health &amp; education cess (4%)</td><td className="text-right">{formatINR(report.tax.cess)}</td></tr>
            <tr className="font-bold text-gray-900"><td colSpan={4} className="pt-1">Estimated tax</td><td className="pt-1 text-right">{formatINR(report.tax.payable)}</td></tr>
          </tfoot>
        </table>
      </div>
      {report.tax.setOff.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          Losses were set off against your highest-taxed gains first
          ({report.tax.setOff.map((s) => `${formatINR(s.amount)} ${s.lossTerm}-term loss`).join(', ')}).
        </p>
      )}
    </div>
  );
}

function Sales({ report, onUndo }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">Booked profit &amp; loss — FY {report.fy}</h3>
      {report.sales.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">
          No sales recorded for this year. Use <b>Sell</b> on any holding in your portfolio to book a profit or loss.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Asset</th>
                <th className="py-2 font-medium">Bought → Sold</th>
                <th className="py-2 font-medium text-right">Sale value</th>
                <th className="py-2 font-medium text-right">Cost</th>
                <th className="py-2 font-medium text-right">Gain / loss</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {report.sales.map((s) => (
                <tr key={s.saleId} className="border-b border-gray-50 align-top">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${TERM_STYLE[s.term]}`}>
                      {TERM_LABEL[s.term]}
                    </span>
                    {[...s.notes, ...s.warnings].map((n) => (
                      <p key={n} className="text-[11px] text-gray-400 mt-1 max-w-xs">{n}</p>
                    ))}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-gray-600">
                    {longDate(s.purchaseDate)} → {longDate(s.saleDate)}
                    <p className="text-[11px] text-gray-400">{s.holdingMonths} months</p>
                  </td>
                  <td className="py-3 text-right">{formatINR(s.saleValue)}</td>
                  <td className="py-3 text-right">{formatINR(s.costUsed)}</td>
                  <td className={`py-3 text-right font-semibold ${s.gain >= 0 ? 'text-groww-gain' : 'text-groww-loss'}`}>
                    {formatINR(s.gain, { showSign: true })}
                  </td>
                  <td className="py-3 pl-2 text-right">
                    <button onClick={() => onUndo(s)} title="Undo this sale (restores the holding)"
                      aria-label={`Undo sale of ${s.name}`} className="p-2 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50">
                      <Undo2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Planning({ planning }) {
  const { gainCandidates, lossCandidates } = planning;
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold text-gray-900">Ways to lower this year's tax</h3>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-800">
            Unused tax-free equity gains: <span className="text-groww-green">{formatINR(planning.ltcgExemptionRemaining)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Long-term gains on shares and equity funds up to ₹1.25 lakh a year are tax-free. Booking gains within this limit (and buying back
            if you want to stay invested) raises your cost price for the future.
          </p>
          {gainCandidates.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-50 border border-gray-100 rounded-xl">
              {gainCandidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-500 text-right">
                    unrealised gain {formatINR(c.unrealisedGain, { showSign: true })} · selling {c.unitsToUseExemption} of {c.quantity} stays tax-free
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lossCandidates.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-800">Book a loss to offset gains you have already made</p>
            <ul className="mt-2 divide-y divide-gray-50 border border-gray-100 rounded-xl">
              {lossCandidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-500 text-right">
                    {c.term}-term loss {formatINR(-c.unrealisedLoss, { showSign: true })} · saves about{' '}
                    <b className="text-groww-gain">{formatINR(c.taxSaving)}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">{planning.note}</p>
    </div>
  );
}
