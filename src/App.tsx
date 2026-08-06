import { useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Cart } from './components/Cart';
import { AuthModal } from './components/AuthModal';
import { SupportChat } from './components/SupportChat';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Vision } from './pages/Vision';
import { Mission } from './pages/Mission';
import { Orders } from './pages/Orders';
import { Checkout } from './pages/Checkout';
import { Referrals } from './pages/Referrals';
import { Policies } from './pages/Policies';
import { ResetPassword } from './pages/ResetPassword';
import { Admin } from './pages/Admin';

export type Page = 'home' | 'about' | 'vision' | 'mission' | 'orders' | 'checkout' | 'referrals' | 'policies' | 'admin';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset-password') === 'true') {
      setIsResetPassword(true);
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

  if (isResetPassword) {
    return (
      <AuthProvider>
        <ResetPassword onComplete={handleResetPasswordComplete} />
      </AuthProvider>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onOpenAuth={() => setIsAuthModalOpen(true)} />;
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
        return <Admin />;
      default:
        return <Home onOpenAuth={() => setIsAuthModalOpen(true)} />;
    }
  };

  return (
    <AuthProvider>
      <CartProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Header
            onNavigate={setCurrentPage}
            currentPage={currentPage}
            onOpenCart={() => setIsCartOpen(true)}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />

          <main className="flex-1">
            {renderPage()}
          </main>

          <Footer />

          <Cart
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            onCheckout={handleCheckout}
          />

          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
          />

          <SupportChat />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
