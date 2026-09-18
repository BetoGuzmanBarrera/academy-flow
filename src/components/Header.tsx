import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  Gift,
  KeyRound,
  LogOut,
  Menu,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import type { Page } from '../App';
import { Drawer } from './ui';

interface HeaderProps {
  onNavigate: (page: Page) => void;
  onNavigateToHomeSection: (sectionId: string) => void;
  currentPage: Page;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onOpenChangePassword: () => void;
}

const navigationClass = 'flex min-h-touch items-center rounded-af-md px-3 text-af-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary';

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

        <nav aria-label="Navegación principal" className="hidden items-center gap-1 xl:flex">
          <button type="button" onClick={() => navigate('catalog')} className={`${navigationClass} ${currentPage === 'catalog' ? 'bg-blue-50 text-academy-primary' : 'text-academy-text hover:bg-academy-subtle'}`}>
            Servicios
          </button>
          <button type="button" onClick={() => navigateToSection('how-it-works')} className={`${navigationClass} text-academy-text hover:bg-academy-subtle`}>
            Cómo funciona
          </button>
          <div
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAboutMenuOpen(false);
            }}
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={aboutMenuOpen}
              onClick={() => {
                setAboutMenuOpen((open) => !open);
                setAccountMenuOpen(false);
              }}
              className={`${navigationClass} gap-1 text-academy-text hover:bg-academy-subtle`}
            >
              Nosotros <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            {aboutMenuOpen && (
              <div role="menu" className="absolute left-0 top-full mt-2 w-48 rounded-af-md border border-academy-border bg-academy-surface p-2 shadow-af-elevated">
                {([['about', 'Quiénes Somos'], ['mission', 'Misión'], ['vision', 'Visión']] as const).map(([page, label]) => (
                  <button key={page} type="button" role="menuitem" onClick={() => navigate(page)} className="min-h-touch w-full rounded-af-sm px-3 text-left text-af-body-sm text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => navigateToSection('help')} className={`${navigationClass} text-academy-text hover:bg-academy-subtle`}>
            Ayuda
          </button>
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          {user && (
            <button type="button" onClick={() => navigate('orders')} className={`${navigationClass} gap-2 text-academy-text hover:bg-academy-subtle`}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Mis órdenes
            </button>
          )}

          {user ? (
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setAccountMenuOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => {
                  setAccountMenuOpen((open) => !open);
                  setAboutMenuOpen(false);
                }}
                className={`${navigationClass} gap-2 text-academy-text hover:bg-academy-subtle`}
              >
                <UserCircle className="h-5 w-5" aria-hidden="true" />
                Cuenta
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              {accountMenuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-af-md border border-academy-border bg-academy-surface p-2 shadow-af-elevated">
                  <button type="button" role="menuitem" onClick={() => navigate('account')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><UserCircle className="h-4 w-4" aria-hidden="true" />Mi cuenta</button>
                  <button type="button" role="menuitem" onClick={() => navigate('referrals')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><Gift className="h-4 w-4" aria-hidden="true" />Referidos</button>
                  {isAdmin && <button type="button" role="menuitem" onClick={() => navigate('admin')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Administración</button>}
                  <button type="button" role="menuitem" onClick={() => { onOpenChangePassword(); setAccountMenuOpen(false); }} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><KeyRound className="h-4 w-4" aria-hidden="true" />Cambiar contraseña</button>
                  <button type="button" role="menuitem" onClick={() => { void signOut(); setAccountMenuOpen(false); }} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm text-academy-danger hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-danger"><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={onOpenAuth} className={`${navigationClass} bg-academy-primary text-white hover:bg-academy-primary-strong`}>
              Ingresar
            </button>
          )}

          <button type="button" onClick={onOpenCart} aria-label={`Abrir carrito${totalItems > 0 ? `, ${totalItems} artículos` : ''}`} className="relative flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {totalItems > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-academy-danger px-1 text-xs font-semibold text-white">{totalItems}</span>}
          </button>
        </div>

        <div className="flex items-center gap-1 xl:hidden">
          <button type="button" onClick={onOpenCart} aria-label={`Abrir carrito${totalItems > 0 ? `, ${totalItems} artículos` : ''}`} className="relative flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {totalItems > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-academy-danger px-1 text-xs font-semibold text-white">{totalItems}</span>}
          </button>
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
          <nav id="mobile-navigation" aria-label="Navegación móvil">
          <div className="space-y-1">
            <button type="button" onClick={() => navigate('catalog')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Servicios</button>
            <button type="button" onClick={() => navigateToSection('how-it-works')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Cómo funciona</button>
            <p className="px-3 pt-3 text-af-label-sm uppercase tracking-wider text-academy-text-muted">Nosotros</p>
            {([['about', 'Quiénes Somos'], ['mission', 'Misión'], ['vision', 'Visión']] as const).map(([page, label]) => (
              <button key={page} type="button" onClick={() => navigate(page)} className={`${navigationClass} w-full pl-6 text-academy-text hover:bg-academy-subtle`}>{label}</button>
            ))}
            <button type="button" onClick={() => navigateToSection('help')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Ayuda</button>
          </div>

          <div className="mt-3 space-y-1 border-t border-academy-border pt-3">
            {user && <button type="button" onClick={() => navigate('orders')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><ClipboardList className="h-4 w-4" aria-hidden="true" />Mis órdenes</button>}
            {user && <button type="button" onClick={() => navigate('account')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><UserCircle className="h-4 w-4" aria-hidden="true" />Mi cuenta</button>}
            {user && <button type="button" onClick={() => navigate('referrals')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><Gift className="h-4 w-4" aria-hidden="true" />Referidos</button>}
            {isAdmin && <button type="button" onClick={() => navigate('admin')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Administración</button>}
            {user ? (
              <>
                <button type="button" onClick={() => { onOpenChangePassword(); setMobileMenuOpen(false); }} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><KeyRound className="h-4 w-4" aria-hidden="true" />Cambiar contraseña</button>
                <button type="button" onClick={() => { void signOut(); setMobileMenuOpen(false); }} className={`${navigationClass} w-full gap-2 text-academy-danger hover:bg-red-50`}><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</button>
              </>
            ) : (
              <button type="button" onClick={() => { onOpenAuth(); setMobileMenuOpen(false); }} className={`${navigationClass} w-full justify-center bg-academy-primary text-white hover:bg-academy-primary-strong`}>Ingresar</button>
            )}
          </div>
          </nav>
        </Drawer>
      </div>
    </>
  );
}
