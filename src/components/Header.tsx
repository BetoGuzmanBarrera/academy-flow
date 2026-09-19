import { BookOpen, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import type { Page } from '../App';
import { Drawer } from './ui';
import { CartButton, DesktopNavigation, DesktopUserNavigation, MobileNavigation } from './header/HeaderNavigation';

interface HeaderProps {
  onNavigate: (page: Page) => void;
  onNavigateToHomeSection: (sectionId: string) => void;
  currentPage: Page;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenChangePassword: () => void;
}

export function Header({
  currentPage,
  onNavigate,
  onNavigateToHomeSection,
  onOpenAuth,
  onOpenCart,
  onOpenChangePassword,
}: HeaderProps) {
  const { user, isAdmin, signOut } = useAuth();
  const { totalItems } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const navigate = (page: Page) => {
    onNavigate(page);
    setMobileMenuOpen(false);
    setAboutMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const navigateToSection = (sectionId: string) => {
    onNavigateToHomeSection(sectionId);
    setMobileMenuOpen(false);
    setAboutMenuOpen(false);
    setAccountMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-academy-border bg-academy-surface shadow-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex min-h-touch items-center gap-2 rounded-af-md text-lg font-bold text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
            aria-label="Ir al inicio de Academy Flow"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-af-md bg-academy-primary text-white"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
            <span>Academy Flow</span>
          </button>

          <DesktopNavigation
            currentPage={currentPage}
            aboutMenuOpen={aboutMenuOpen}
            onNavigate={navigate}
            onNavigateToSection={navigateToSection}
            onCloseAbout={() => setAboutMenuOpen(false)}
            onToggleAbout={() => {
              setAboutMenuOpen((open) => !open);
              setAccountMenuOpen(false);
            }}
          />

          <DesktopUserNavigation
            userPresent={Boolean(user)}
            isAdmin={isAdmin}
            accountMenuOpen={accountMenuOpen}
            totalItems={totalItems}
            onNavigate={navigate}
            onOpenAuth={onOpenAuth}
            onOpenCart={onOpenCart}
            onOpenChangePassword={() => { onOpenChangePassword(); setAccountMenuOpen(false); }}
            onSignOut={() => { void signOut(); setAccountMenuOpen(false); }}
            onCloseAccount={() => setAccountMenuOpen(false)}
            onToggleAccount={() => {
              setAccountMenuOpen((open) => !open);
              setAboutMenuOpen(false);
            }}
          />

          <div className="flex items-center gap-1 xl:hidden">
            <CartButton totalItems={totalItems} onOpenCart={onOpenCart} mobile />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-haspopup="dialog"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="xl:hidden">
        <Drawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          title="Menú"
          ariaLabel="Navegación móvil"
          side="right"
          className="max-w-sm"
        >
          <MobileNavigation
            userPresent={Boolean(user)}
            isAdmin={isAdmin}
            onNavigate={navigate}
            onNavigateToSection={navigateToSection}
            onOpenAuth={() => { onOpenAuth(); setMobileMenuOpen(false); }}
            onOpenChangePassword={() => { onOpenChangePassword(); setMobileMenuOpen(false); }}
            onSignOut={() => { void signOut(); setMobileMenuOpen(false); }}
          />
        </Drawer>
      </div>
    </>
  );
}
