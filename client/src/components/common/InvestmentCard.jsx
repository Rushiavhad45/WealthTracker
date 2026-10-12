import { AlertTriangle, HandCoins, Trash2 } from 'lucide-react';
import { formatINR, formatPercent, calculateReturns } from '../../utils/formatCurrency';
import { INVESTMENT_TYPES } from '../../data/investmentTypes';

export default function InvestmentCard({ investment, hideBalance, onClick, onDelete, onSell }) {
  const typeInfo = INVESTMENT_TYPES[investment.type];
  const { gain, percent } = calculateReturns(investment.current, investment.invested);
  const isPositive = gain >= 0;
  const priceUnavailable = investment.priceStatus === 'stale' || investment.priceStatus === 'pending';

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Remove "${investment.name}" from your portfolio?`)) onDelete(investment);
  };

  return (
    <div onClick={onClick} className="card hover:shadow-hover cursor-pointer transition-all group">
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform"
          style={{ backgroundColor: typeInfo.bgColor }}
        >
          <span className="text-sm font-bold" style={{ color: typeInfo.color }}>
            {investment.symbol?.slice(0, 3) || investment.name.slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{investment.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{typeInfo.label}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-gray-900">{hideBalance ? '₹ •••••' : formatINR(investment.current)}</p>
              <span className={isPositive ? 'badge-gain' : 'badge-loss'}>
                {hideBalance ? '••%' : formatPercent(percent)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Invested</p>
              <p className="text-sm font-medium text-gray-700">
                {hideBalance ? '₹ ••••' : formatINR(investment.invested, { compact: true })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Returns</p>
              <p className={`text-sm font-medium ${isPositive ? 'text-groww-gain' : 'text-groww-loss'}`}>
                {hideBalance ? '₹ •••' : formatINR(gain, { showSign: true, compact: true })}
              </p>
            </div>
            {investment.quantity && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Qty</p>
                <p className="text-sm font-medium text-gray-700">{investment.quantity}</p>
              </div>
            )}
            {investment.units && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Units</p>
                <p className="text-sm font-medium text-gray-700">{investment.units}</p>
              </div>
            )}
            {onSell && investment.type !== 'fixed_deposit' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSell(investment);
                }}
                title="Record a sale (books profit for tax)"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-groww-green bg-groww-green/10 hover:bg-groww-green/20 transition-colors"
              >
                <HandCoins className="w-3.5 h-3.5" />
                Sell
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                title="Remove holding"
                aria-label={`Remove ${investment.name}`}
                className={`${onSell && investment.type !== 'fixed_deposit' ? '' : 'ml-auto '}p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {priceUnavailable && (
            <p className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {investment.priceStatus === 'pending'
                ? 'Live price not fetched yet — will update automatically'
                : 'Latest price unavailable — showing last known value'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
