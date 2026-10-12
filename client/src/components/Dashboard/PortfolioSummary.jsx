import { Eye, EyeOff, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { usePortfolio } from '../../context/PortfolioContext';
import { formatINR, formatPercent } from '../../utils/formatCurrency';

function formatUpdated(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export default function PortfolioSummary() {
  const { summary, hideBalance, pricesUpdatedAt, staleCount, refreshPrices, refreshing } = usePortfolio();
  const isPositive = summary.totalGain >= 0;
  const dayPositive = summary.dayChange >= 0;
  const updated = formatUpdated(pricesUpdatedAt);

  return (
    <div className="card bg-gradient-to-br from-groww-green to-emerald-600 text-white border-0 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <p className="text-white/80 text-sm font-medium">Total Portfolio Value</p>
          {hideBalance ? <EyeOff className="w-4 h-4 text-white/60" /> : <Eye className="w-4 h-4 text-white/60" />}
        </div>

        <h2 className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight">
          {hideBalance ? '₹ ••••••' : formatINR(summary.totalCurrent)}
        </h2>

        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-white/70 text-xs mb-0.5">Invested</p>
            <p className="font-semibold">{hideBalance ? '₹ ••••••' : formatINR(summary.totalInvested)}</p>
          </div>
          <div>
            <p className="text-white/70 text-xs mb-0.5">Total Returns</p>
            <div className="flex items-center gap-1.5">
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <p className="font-semibold">
                {hideBalance
                  ? '₹ ••••'
                  : `${formatINR(summary.totalGain, { showSign: true })} (${formatPercent(summary.totalGainPercent)})`}
              </p>
            </div>
          </div>
          <div>
            <p className="text-white/70 text-xs mb-0.5">1 Day Change</p>
            <div className="flex items-center gap-1.5">
              {dayPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <p className="font-semibold">
                {hideBalance
                  ? '₹ ••••'
                  : `${formatINR(summary.dayChange, { showSign: true })} (${formatPercent(summary.dayChangePercent)})`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-5 pt-3 border-t border-white/15 text-xs text-white/80">
          <span>
            {updated ? `Prices updated ${updated} IST` : 'Prices update automatically every day'}
            {staleCount > 0 && (
              <span className="ml-2 bg-white/20 rounded-md px-2 py-0.5">
                {staleCount} holding{staleCount > 1 ? 's' : ''} showing last known price
              </span>
            )}
          </span>
          <button
            onClick={() => refreshPrices().catch((e) => window.alert(e.message))}
            disabled={refreshing}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-60 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}
