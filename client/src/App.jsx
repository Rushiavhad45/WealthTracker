import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Investments from './pages/Investments';
import AddInvestment from './pages/AddInvestment';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';
import Tax from './pages/Tax';
import Login from './pages/Login';
import { useAuth } from './context/AuthContext';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="investments" element={<Investments />} />
        <Route path="investments/:type" element={<Investments />} />
        <Route path="add" element={<AddInvestment />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="tax" element={<Tax />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
