import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { formatINR, formatPercent, calculateReturns } from '../utils/formatCurrency';
import { useMemo } from 'react';
import { toMonthly } from '../utils/history';

export default function Analytics() {
  const { summary, investments, hideBalance, history } = usePortfolio();
  const monthly = useMemo(() => toMonthly(history), [history]);

  const pieData = summary.allocation.map((a) => ({
    name: a.label,
    value: a.value,
    color: a.color,
  }));

  const returnsByType = summary.allocation.map((a) => {
    const typeInvestments = investments.filter((i) => i.type === a.type);
    const invested = typeInvestments.reduce((s, i) => s + i.invested, 0);
    const current = typeInvestments.reduce((s, i) => s + i.current, 0);
    const { percent } = calculateReturns(current, invested);
    return { name: a.label, returns: percent, color: a.color };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">Portfolio insights & performance</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="Total Value" value={hideBalance ? '₹ ••••••' : formatINR(summary.totalCurrent)} />
        <StatBox
          label="Total Returns"
          value={hideBalance ? '₹ ••••' : formatINR(summary.totalGain, { showSign: true })}
          positive={summary.totalGain >= 0}
        />
        <StatBox
          label="Return %"
          value={hideBalance ? '••%' : formatPercent(summary.totalGainPercent)}
          positive={summary.totalGainPercent >= 0}
        />
        <StatBox label="Asset Classes" value={summary.allocation.length.toString()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Asset Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => (hideBalance ? '₹ ••••' : formatINR(value))}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Returns by Asset Class</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={returnsByType} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                <Bar dataKey="returns" radius={[6, 6, 0, 0]}>
                  {returnsByType.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Portfolio Value Over Time</h3>
        <div className="h-64">
          {monthly.length === 0 ? (
            <p className="h-full flex items-center justify-center text-sm text-gray-400">
              History builds up with each daily price update.
            </p>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => (hideBalance ? '₹ ••••' : formatINR(v))} />
              <Bar dataKey="value" fill="#00D09C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Top Performers</h3>
        <div className="space-y-3">
          {[...investments]
            .map((inv) => ({ ...inv, ...calculateReturns(inv.current, inv.invested) }))
            .sort((a, b) => b.percent - a.percent)
            .slice(0, 5)
            .map((inv, i) => (
              <div key={inv.id} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-xs font-bold flex items-center justify-center text-gray-500">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{inv.name}</p>
                </div>
                <span className={inv.percent >= 0 ? 'badge-gain' : 'badge-loss'}>
                  {hideBalance ? '••%' : formatPercent(inv.percent)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, positive }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${
          positive === true ? 'text-groww-gain' : positive === false ? 'text-groww-loss' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
