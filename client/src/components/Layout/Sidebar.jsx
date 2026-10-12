import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  PlusCircle,
  BarChart3,
  Receipt,
  User,
  TrendingUp,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/investments', icon: Wallet, label: 'Investments' },
  { to: '/add', icon: PlusCircle, label: 'Add New' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/tax', icon: Receipt, label: 'Tax' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 z-40">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-10 h-10 bg-groww-green rounded-xl flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-gray-900">WealthTrack</h1>
          <p className="text-xs text-gray-400">Investment Tracker</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-groww-green/10 text-groww-green'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100">
        <div className="bg-gradient-to-br from-groww-green/10 to-emerald-50 rounded-xl p-4">
          <p className="text-xs font-medium text-groww-green mb-1">Pro Tip</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            Diversify across asset classes for better risk-adjusted returns.
          </p>
        </div>
      </div>
    </aside>
  );
}
