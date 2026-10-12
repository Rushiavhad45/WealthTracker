import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePortfolio } from '../../context/PortfolioContext';
import { formatINR, formatPercent, calculateReturns } from '../../utils/formatCurrency';
import { INVESTMENT_TYPES } from '../../data/investmentTypes';

export default function AssetAllocation() {
  const { summary, hideBalance } = usePortfolio();

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Asset Allocation</h3>
        <Link to="/analytics" className="text-sm text-groww-green font-medium flex items-center gap-1 hover:underline">
          View All <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {summary.allocation
          .sort((a, b) => b.value - a.value)
          .map((item) => (
            <Link
              key={item.type}
              to={`/investments/${item.type}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 transition-colors group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: item.bgColor }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-gray-900">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {hideBalance ? '₹ ••••' : formatINR(item.value, { compact: true })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{item.percentage.toFixed(1)}%</span>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-groww-green transition-colors" />
            </Link>
          ))}
      </div>
    </div>
  );
}

export function RecentInvestments() {
  const { investments, hideBalance } = usePortfolio();

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Recent Holdings</h3>
        <Link to="/investments" className="text-sm text-groww-green font-medium hover:underline">
          See all
        </Link>
      </div>

      {investments.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          No holdings yet.{' '}
          <Link to="/add" className="text-groww-green font-medium hover:underline">
            Add your first investment
          </Link>
        </p>
      )}

      <div className="space-y-1">
        {investments.slice(0, 5).map((inv) => {
          const { gain, percent } = calculateReturns(inv.current, inv.invested);
          const typeInfo = INVESTMENT_TYPES[inv.type];
          const isPositive = gain >= 0;

          return (
            <div
              key={inv.id}
              className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: typeInfo.bgColor }}
              >
                <span className="text-xs font-bold" style={{ color: typeInfo.color }}>
                  {inv.symbol?.slice(0, 2) || inv.name.slice(0, 2)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{inv.name}</p>
                <p className="text-xs text-gray-500">{typeInfo.label}</p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-sm">
                  {hideBalance ? '₹ ••••' : formatINR(inv.current, { compact: true })}
                </p>
                <p className={`text-xs font-medium ${isPositive ? 'text-groww-gain' : 'text-groww-loss'}`}>
                  {hideBalance ? '••%' : formatPercent(percent)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
