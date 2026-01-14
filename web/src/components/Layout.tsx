import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Plus, LogOut } from 'lucide-react';
import { useAuthStore } from '../lib/store';

export default function Layout() {
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">Mikanarr</h1>
          </div>
          <div className="flex items-center gap-4">
            {location.pathname === '/' ? (
              <Link
                to="/patterns/new"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Pattern
              </Link>
            ) : (
              <Link
                to="/"
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Back to List
              </Link>
            )}
            <button
              onClick={logout}
              className="p-2 text-gray-500 hover:text-gray-700"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
