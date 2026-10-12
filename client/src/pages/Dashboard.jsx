import PortfolioSummary from '../components/Dashboard/PortfolioSummary';
import QuickActions from '../components/Dashboard/QuickActions';
import AssetAllocation, { RecentInvestments } from '../components/Dashboard/AssetAllocation';
import PortfolioChart from '../components/Dashboard/PortfolioChart';
import { usePortfolio } from '../context/PortfolioContext';
import { INVESTMENT_TYPES } from '../data/investmentTypes';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { summary } = usePortfolio();

  return (
    <div className="space-y-6">
      <PortfolioSummary />
      <QuickActions />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.values(INVESTMENT_TYPES).map((type) => {
          const alloc = summary.allocation.find((a) => a.type === type.id);
          return (
            <Link
              key={type.id}
              to={`/investments/${type.id}`}
              className="card p-4 hover:shadow-hover transition-all text-center group"
            >
              <div
                className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center group-hover:scale-110 transition-transform"
                style={{ backgroundColor: type.bgColor }}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }} />
              </div>
              <p className="text-xs font-medium text-gray-700">{type.label}</p>
              {alloc && (
                <p className="text-[10px] text-gray-400 mt-0.5">{alloc.count} holding{alloc.count > 1 ? 's' : ''}</p>
              )}
            </Link>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <PortfolioChart />
        <AssetAllocation />
      </div>

      <RecentInvestments />
    </div>
  );
}
