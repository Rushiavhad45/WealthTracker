import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { usePortfolio } from '../../context/PortfolioContext';
import { formatINR } from '../../utils/formatCurrency';
import { filterRange, longDate, shortDate } from '../../utils/history';

const RANGES = ['1M', '6M', '1Y', 'All'];

function CustomTooltip({ active, payload, hideBalance }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white shadow-lg rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-xs text-gray-500 mb-1">{longDate(point.date)}</p>
      <p className="font-bold text-gray-900">{hideBalance ? '₹ ••••••' : formatINR(point.value)}</p>
    </div>
  );
}

export default function PortfolioChart() {
  const { history, hideBalance } = usePortfolio();
  const [range, setRange] = useState('1Y');

  const data = useMemo(
    () =>
      filterRange(history, range).map((p) => ({
        date: p.date,
        label: shortDate(p.date),
        value: p.current,
      })),
    [history, range]
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Portfolio Growth</h3>
          <p className="text-xs text-gray-500 mt-0.5">Updated daily</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {RANGES.map((period) => (
            <button
              key={period}
              onClick={() => setRange(period)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === period ? 'bg-white text-groww-green shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <div className="h-52 relative">
        {data.length < 2 && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 z-10">
            <p className="text-sm text-gray-400">
              {data.length === 0
                ? 'Add an investment to start tracking your growth.'
                : 'Your growth chart builds up with each daily price update — check back tomorrow.'}
            </p>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00D09C" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00D09C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} minTickGap={30} />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip content={<CustomTooltip hideBalance={hideBalance} />} />
            <Area type="monotone" dataKey="value" stroke="#00D09C" strokeWidth={2.5} fill="url(#colorValue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
