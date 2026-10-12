import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, PlusCircle, BarChart3, Receipt, User } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/investments', icon: Wallet, label: 'Portfolio' },
  { to: '/add', icon: PlusCircle, label: 'Add' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/tax', icon: Receipt, label: 'Tax' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 px-2 py-2 safe-area-bottom">
      <div className="flex items-center justify-around">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all ${
                isActive ? 'text-groww-green' : 'text-gray-400'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
