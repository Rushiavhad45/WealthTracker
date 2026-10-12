import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="pb-24 lg:pb-8 px-4 lg:px-8 pt-4 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
