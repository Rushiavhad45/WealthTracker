import { Bell, Search, Eye, EyeOff } from 'lucide-react';
import { usePortfolio } from '../../context/PortfolioContext';
import { getGreeting } from '../../utils/formatCurrency';

export default function Header() {
  const { user, hideBalance, setHideBalance } = usePortfolio();

  return (
    <header className="sticky top-0 z-30 bg-gray-50/80 backdrop-blur-md border-b border-gray-100 px-4 lg:px-8 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="lg:hidden">
          <h1 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <span className="w-8 h-8 bg-groww-green rounded-lg inline-flex items-center justify-center text-white text-sm">W</span>
            WealthTrack
          </h1>
        </div>

        <div className="hidden lg:block">
          <p className="text-sm text-gray-500">{getGreeting()},</p>
          <h2 className="text-xl font-bold text-gray-900">{user.name.split(' ')[0]} 👋</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2 gap-2 w-64">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search investments..."
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-gray-400"
            />
          </div>

          <button
            onClick={() => setHideBalance(!hideBalance)}
            className="p-2.5 rounded-xl bg-white border border-gray-200 hover:border-groww-green transition-colors"
            title={hideBalance ? 'Show balance' : 'Hide balance'}
          >
            {hideBalance ? (
              <EyeOff className="w-5 h-5 text-gray-600" />
            ) : (
              <Eye className="w-5 h-5 text-gray-600" />
            )}
          </button>

          <button className="p-2.5 rounded-xl bg-white border border-gray-200 hover:border-groww-green transition-colors relative">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-groww-green rounded-full" />
          </button>

          <div className="hidden sm:flex w-10 h-10 rounded-full bg-groww-green text-white items-center justify-center font-semibold text-sm">
            {user.name.charAt(0)}
          </div>
        </div>
      </div>
    </header>
  );
}
