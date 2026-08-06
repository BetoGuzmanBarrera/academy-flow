import { ShoppingCart, User, LogOut, Menu, X, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import type { Page } from '../App';

interface HeaderProps {
  onNavigate: (page: Page) => void;
  currentPage: Page;
  onOpenCart: () => void;
  onOpenAuth: () => void;
}

export function Header({ onNavigate, currentPage, onOpenCart, onOpenAuth }: HeaderProps) {
  const { user, isAdmin, signOut } = useAuth();
  const { totalItems } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: Page; label: string }[] = [
    { id: 'home', label: 'Inicio' },
    { id: 'about', label: 'Quiénes Somos' },
    { id: 'vision', label: 'Visión' },
    { id: 'mission', label: 'Misión' },
    { id: 'referrals', label: 'Referidos' },
    { id: 'policies', label: 'Políticas' },
  ];

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              onClick={() => onNavigate('home')}
              className="text-2xl font-bold text-blue-600 hover:text-blue-700 transition"
            >
              Academy Flow
            </button>
          </div>

          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`${
                  currentPage === item.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-700 hover:text-blue-600'
                } px-3 py-2 text-sm font-medium transition`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <button
                onClick={() => onNavigate('orders')}
                className="text-gray-700 hover:text-blue-600 transition flex items-center space-x-2"
              >
                <User size={20} />
                <span className="text-sm">Mis Órdenes</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => onNavigate('admin')}
                className="text-gray-700 hover:text-blue-600 transition flex items-center space-x-2"
              >
                <ShieldCheck size={20} />
                <span className="text-sm">Administración</span>
              </button>
            )}

            {user ? (
              <button
                onClick={signOut}
                className="flex items-center space-x-2 text-gray-700 hover:text-red-600 transition"
              >
                <LogOut size={20} />
                <span className="text-sm">Salir</span>
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Ingresar
              </button>
            )}

            <button
              onClick={onOpenCart}
              className="relative p-2 text-gray-700 hover:text-blue-600 transition"
            >
              <ShoppingCart size={24} />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-700"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t">
          <nav className="px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`${
                  currentPage === item.id ? 'text-blue-600 font-semibold' : 'text-gray-700'
                } block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition`}
              >
                {item.label}
              </button>
            ))}

            {user && (
              <button
                onClick={() => {
                  onNavigate('orders');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center space-x-2 w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
              >
                <User size={18} />
                <span>Mis Órdenes</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => {
                  onNavigate('admin');
                  setMobileMenuOpen(false);
                }}
                className="flex items-center space-x-2 w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
              >
                <ShieldCheck size={18} />
                <span>Administración</span>
              </button>
            )}

            <div className="border-t pt-2 space-y-2">
              <button
                onClick={() => {
                  onOpenCart();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
              >
                <span className="flex items-center space-x-2">
                  <ShoppingCart size={18} />
                  <span>Carrito</span>
                </span>
                {totalItems > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                    {totalItems}
                  </span>
                )}
              </button>

              {user ? (
                <button
                  onClick={signOut}
                  className="flex items-center space-x-2 w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50 rounded"
                >
                  <LogOut size={18} />
                  <span>Salir</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    onOpenAuth();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Ingresar
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
