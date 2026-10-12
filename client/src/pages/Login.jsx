import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', pan: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/';
  if (user) return <Navigate to={from} replace />;

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          pan: form.pan,
        });
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-11 h-11 bg-groww-green rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900 leading-tight">WealthTrack</h1>
            <p className="text-xs text-gray-400">Investment Tracker</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[
              ['login', 'Sign in'],
              ['register', 'Create account'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setError('');
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === id ? 'bg-white text-groww-green shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {isRegister && (
            <Field label="Full name *">
              <input required autoComplete="name" className="input-field" value={form.name}
                onChange={(e) => update('name', e.target.value)} placeholder="Rahul Sharma" />
            </Field>
          )}

          <Field label="Email *">
            <input required type="email" autoComplete="email" className="input-field" value={form.email}
              onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" />
          </Field>

          <Field label="Password *">
            <input required type="password" minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'} className="input-field"
              value={form.password} onChange={(e) => update('password', e.target.value)}
              placeholder={isRegister ? 'At least 8 characters' : 'Your password'} />
          </Field>

          {isRegister && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (optional)">
                <input type="tel" autoComplete="tel" className="input-field" value={form.phone}
                  onChange={(e) => update('phone', e.target.value)} placeholder="+91 98765 43210" />
              </Field>
              <Field label="PAN (optional)">
                <input className="input-field" maxLength={10} value={form.pan}
                  onChange={(e) => update('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
              </Field>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">All values are shown in Indian Rupees (₹)</p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
