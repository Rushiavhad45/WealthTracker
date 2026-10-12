import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { INVESTMENT_TYPES } from '../data/investmentTypes';
import InvestmentCard from '../components/common/InvestmentCard';
import { formatINR } from '../utils/formatCurrency';
import { api } from '../services/api';
import SellModal from '../components/common/SellModal';

export default function Investments() {
  const { type } = useParams();
  const { getInvestmentsByType, hideBalance, summary, removeInvestment, loading, error } = usePortfolio();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(type || 'all');
  const [exporting, setExporting] = useState(false);
  const [selling, setSelling] = useState(null);
  const [soldNotice, setSoldNotice] = useState('');

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.downloadCsv(activeFilter);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = (inv) => removeInvestment(inv.id).catch((e) => window.alert(e.message));

  const filtered = getInvestmentsByType(activeFilter).filter(
    (inv) =>
      inv.name.toLowerCase().includes(search.toLowerCase()) ||
      inv.symbol?.toLowerCase().includes(search.toLowerCase())
  );

  const typeInfo = activeFilter !== 'all' ? INVESTMENT_TYPES[activeFilter] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {typeInfo ? typeInfo.label : 'All Investments'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {filtered.length} holding{filtered.length !== 1 ? 's' : ''} · Total{' '}
          {hideBalance
            ? '₹ ••••••'
            : formatINR(
                filtered.reduce((s, i) => s + i.current, 0)
              )}
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or symbol..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Download as CSV"
          className="flex items-center gap-2 px-4 rounded-xl bg-white border border-gray-200 hover:border-groww-green text-sm font-medium text-gray-600 disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">{exporting ? 'Exporting…' : 'Export CSV'}</span>
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <FilterChip
          label="All"
          count={summary.allocation.reduce((s, a) => s + a.count, 0)}
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        {Object.values(INVESTMENT_TYPES).map((t) => {
          const alloc = summary.allocation.find((a) => a.type === t.id);
          if (!alloc) return null;
          return (
            <FilterChip
              key={t.id}
              label={t.label}
              count={alloc.count}
              active={activeFilter === t.id}
              onClick={() => setActiveFilter(t.id)}
              color={t.color}
            />
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-2 card text-center py-12">
            <p className="text-gray-500">
              {loading ? 'Loading your holdings…' : error || 'No investments found'}
            </p>
            {!loading && !error && getInvestmentsByType('all').length === 0 && (
              <Link to="/add" className="inline-block mt-3 text-sm font-medium text-groww-green hover:underline">
                Add your first investment
              </Link>
            )}
          </div>
        ) : (
          filtered.map((inv) => (
            <InvestmentCard key={inv.id} investment={inv} hideBalance={hideBalance} onDelete={handleDelete} onSell={setSelling} />
          ))
        )}
      </div>
      {soldNotice && (
        <p role="status" className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white text-sm rounded-xl px-5 py-3 shadow-lg">
          {soldNotice}{' '}
          <Link to="/tax" className="underline font-medium">View in Tax Centre</Link>
        </p>
      )}
      {selling && (
        <SellModal
          investment={selling}
          onClose={() => setSelling(null)}
          onSold={() => {
            setSoldNotice(`Sale of ${selling.name} recorded.`);
            setSelling(null);
            setTimeout(() => setSoldNotice(''), 6000);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border ${
        active
          ? 'bg-groww-green text-white border-groww-green'
          : 'bg-white text-gray-600 border-gray-200 hover:border-groww-green'
      }`}
    >
      {color && !active && (
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
      <span className={`text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>({count})</span>
    </button>
  );
}
