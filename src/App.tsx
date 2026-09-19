import { lazy, Suspense, useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Cart } from './components/Cart';
import { AuthModal } from './components/AuthModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SupportChat } from './components/SupportChat';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Vision } from './pages/Vision';
import { Mission } from './pages/Mission';
import { Policies } from './pages/Policies';

const Catalog = lazy(() => import('./pages/Catalog').then(({ Catalog }) => ({ default: Catalog })));
const Orders = lazy(() => import('./pages/Orders').then(({ Orders }) => ({ default: Orders })));
const Checkout = lazy(() => import('./pages/Checkout').then(({ Checkout }) => ({ default: Checkout })));
const Referrals = lazy(() => import('./pages/Referrals').then(({ Referrals }) => ({ default: Referrals })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(({ ResetPassword }) => ({ default: ResetPassword })));
const Admin = lazy(() => import('./pages/Admin').then(({ Admin }) => ({ default: Admin })));
const Account = lazy(() => import('./pages/Account').then(({ Account }) => ({ default: Account })));

const pageFallback = (
  <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center text-academy-text-muted">
    Cargando página...
  </div>
);

export type Page = 'home' | 'catalog' | 'about' | 'vision' | 'mission' | 'orders' | 'checkout' | 'referrals' | 'policies' | 'admin' | 'account';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset-password') === 'true') {
      setIsResetPassword(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('payment') === 'success') {
      setCurrentPage('orders');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('payment') === 'cancelled') {
      setCurrentPage('orders');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleCheckout = () => {
    setIsCartOpen(false);
    setCurrentPage('checkout');
  };

  const handleCheckoutComplete = () => {
    setCurrentPage('orders');
  };

  const handleResetPasswordComplete = () => {
    setIsResetPassword(false);
    setCurrentPage('home');
  };

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleNavigateToHomeSection = (sectionId: string) => {
    setCurrentPage('home');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    });
  };

  if (isResetPassword) {
    return (
      <AuthProvider>
        <Suspense fallback={pageFallback}>
          <ResetPassword onComplete={handleResetPasswordComplete} />
        </Suspense>
      </AuthProvider>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onOpenAuth={() => setIsAuthModalOpen(true)} onNavigate={handleNavigate} />;
      case 'catalog':
        return <Catalog onOpenAuth={() => setIsAuthModalOpen(true)} />;
      case 'about':
        return <About />;
      case 'vision':
        return <Vision />;
      case 'mission':
        return <Mission />;
      case 'orders':
        return <Orders />;
      case 'checkout':
        return (
          <Checkout
            onBack={() => setIsCartOpen(true)}
            onComplete={handleCheckoutComplete}
          />
        );
      case 'referrals':
        return <Referrals />;
      case 'policies':
        return <Policies />;
      case 'admin':
        return <Admin onNavigate={handleNavigate} />;
      case 'account':
        return (
          <Account
            onNavigate={handleNavigate}
            onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          />
        );
      default:
        return <Home onOpenAuth={() => setIsAuthModalOpen(true)} onNavigate={handleNavigate} />;
    }
  };

  return (
    <AuthProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-academy-background">
          {currentPage !== 'admin' && (
            <Header
              onNavigate={handleNavigate}
              currentPage={currentPage}
              onOpenCart={() => setIsCartOpen(true)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onOpenChangePassword={() => setIsChangePasswordOpen(true)}
              onNavigateToHomeSection={handleNavigateToHomeSection}
            />
          )}

          <main className="flex-1">
            <Suspense fallback={pageFallback}>
              {renderPage()}
            </Suspense>
          </main>

          {currentPage !== 'admin' && (
            <Footer
              onNavigate={handleNavigate}
              onNavigateToHomeSection={handleNavigateToHomeSection}
            />
          )}

          {currentPage !== 'admin' && (
            <Cart
              isOpen={isCartOpen}
              onClose={() => setIsCartOpen(false)}
              onCheckout={handleCheckout}
            />
          )}

          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
          />

          <ChangePasswordModal
            isOpen={isChangePasswordOpen}
            onClose={() => setIsChangePasswordOpen(false)}
          />

          {currentPage !== 'admin' && <SupportChat />}
        </div>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
