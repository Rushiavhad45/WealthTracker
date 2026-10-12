import {
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Shield,
  Bell,
  Moon,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { usePortfolio } from '../context/PortfolioContext';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/formatCurrency';

export default function Profile() {
  const { user, summary, hideBalance } = usePortfolio();
  const { logout } = useAuth();

  const menuItems = [
    { icon: Bell, label: 'Notifications', desc: 'SIP reminders, maturity alerts' },
    { icon: Shield, label: 'Security', desc: 'PIN, biometrics, 2FA' },
    { icon: Moon, label: 'Appearance', desc: 'Theme preferences' },
    { icon: LogOut, label: 'Logout', desc: 'Sign out of your account', danger: true, onClick: logout },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-groww-green text-white flex items-center justify-center text-2xl font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-sm text-gray-500">Member since {user.memberSince}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Portfolio Value</p>
            <p className="font-bold text-lg text-gray-900">
              {hideBalance ? '₹ ••••••' : formatINR(summary.totalCurrent, { compact: true })}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Holdings</p>
            <p className="font-bold text-lg text-gray-900">
              {summary.allocation.reduce((s, a) => s + a.count, 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-900">Account Details</h3>
        <InfoRow icon={Mail} label="Email" value={user.email} />
        <InfoRow icon={Phone} label="Phone" value={user.phone || '—'} />
        <InfoRow icon={CreditCard} label="PAN" value={user.pan || '—'} />
        <InfoRow icon={Calendar} label="Member Since" value={user.memberSince} />
      </div>

      <div className="card divide-y divide-gray-50 p-0 overflow-hidden">
        {menuItems.map(({ icon: Icon, label, desc, danger, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex items-center gap-4 w-full px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className={`p-2 rounded-xl ${danger ? 'bg-red-50' : 'bg-gray-50'}`}>
              <Icon className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-gray-600'}`} />
            </div>
            <div className="flex-1">
              <p className={`font-medium text-sm ${danger ? 'text-red-600' : 'text-gray-900'}`}>{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 pb-4">
        WealthTrack v1.0.0 · Made for Indian Investors 🇮🇳
      </p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
