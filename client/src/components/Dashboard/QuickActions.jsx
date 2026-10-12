import { Link } from 'react-router-dom';
import { Plus, ArrowRightLeft, FileText, Target } from 'lucide-react';

const actions = [
  { icon: Plus, label: 'Add Investment', to: '/add', color: 'bg-groww-green' },
  { icon: ArrowRightLeft, label: 'Compare', to: '/analytics', color: 'bg-blue-500' },
  { icon: FileText, label: 'Tax', to: '/tax', color: 'bg-purple-500' },
  { icon: Target, label: 'Goals', to: '/profile', color: 'bg-orange-500' },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map(({ icon: Icon, label, to, color }) => (
        <Link
          key={label}
          to={to}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border border-gray-100 hover:shadow-hover transition-all group"
        >
          <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-medium text-gray-600 text-center leading-tight">{label}</span>
        </Link>
      ))}
    </div>
  );
}
