import {
  ChevronDown,
  ClipboardList,
  Gift,
  KeyRound,
  LogOut,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
} from 'lucide-react';
import type { Page } from '../../App';

const navigationClass = 'flex min-h-touch items-center rounded-af-md px-3 text-af-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary';

interface NavigationProps {
  onNavigate: (page: Page) => void;
  onNavigateToSection: (sectionId: string) => void;
}

interface DesktopNavigationProps extends NavigationProps {
  currentPage: Page;
  aboutMenuOpen: boolean;
  onCloseAbout: () => void;
  onToggleAbout: () => void;
}

export function DesktopNavigation({ currentPage, aboutMenuOpen, onNavigate, onNavigateToSection, onCloseAbout, onToggleAbout }: DesktopNavigationProps) {
  return (
    <nav aria-label="Navegación principal" className="hidden items-center gap-1 xl:flex">
      <button type="button" onClick={() => onNavigate('catalog')} className={`${navigationClass} ${currentPage === 'catalog' ? 'bg-blue-50 text-academy-primary' : 'text-academy-text hover:bg-academy-subtle'}`}>
        Servicios
      </button>
      <button type="button" onClick={() => onNavigateToSection('how-it-works')} className={`${navigationClass} text-academy-text hover:bg-academy-subtle`}>
        Cómo funciona
      </button>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onCloseAbout();
        }}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={aboutMenuOpen}
          onClick={onToggleAbout}
          className={`${navigationClass} gap-1 text-academy-text hover:bg-academy-subtle`}
        >
          Nosotros <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {aboutMenuOpen && (
          <div role="menu" className="absolute left-0 top-full mt-2 w-48 rounded-af-md border border-academy-border bg-academy-surface p-2 shadow-af-elevated">
            {([['about', 'Quiénes Somos'], ['mission', 'Misión'], ['vision', 'Visión']] as const).map(([page, label]) => (
              <button key={page} type="button" role="menuitem" onClick={() => onNavigate(page)} className="min-h-touch w-full rounded-af-sm px-3 text-left text-af-body-sm text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={() => onNavigateToSection('help')} className={`${navigationClass} text-academy-text hover:bg-academy-subtle`}>
        Ayuda
      </button>
    </nav>
  );
}

interface CartButtonProps {
  totalItems: number;
  onOpenCart: () => void;
  mobile?: boolean;
}

export function CartButton({ totalItems, onOpenCart, mobile = false }: CartButtonProps) {
  return (
    <button type="button" onClick={onOpenCart} aria-label={`Abrir carrito${totalItems > 0 ? `, ${totalItems} artículos` : ''}`} className={mobile
      ? 'relative flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary'
      : 'relative flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary'}>
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      {totalItems > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-academy-danger px-1 text-xs font-semibold text-white">{totalItems}</span>}
    </button>
  );
}

interface DesktopUserNavigationProps {
  userPresent: boolean;
  isAdmin: boolean;
  accountMenuOpen: boolean;
  totalItems: number;
  onNavigate: (page: Page) => void;
  onOpenAuth: () => void;
  onOpenCart: () => void;
  onOpenChangePassword: () => void;
  onSignOut: () => void;
  onCloseAccount: () => void;
  onToggleAccount: () => void;
}

export function DesktopUserNavigation({ userPresent, isAdmin, accountMenuOpen, totalItems, onNavigate, onOpenAuth, onOpenCart, onOpenChangePassword, onSignOut, onCloseAccount, onToggleAccount }: DesktopUserNavigationProps) {
  return (
    <div className="hidden items-center gap-2 xl:flex">
      {userPresent && (
        <button type="button" onClick={() => onNavigate('orders')} className={`${navigationClass} gap-2 text-academy-text hover:bg-academy-subtle`}>
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          Mis órdenes
        </button>
      )}

      {userPresent ? (
        <div
          className="relative"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onCloseAccount();
          }}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={onToggleAccount}
            className={`${navigationClass} gap-2 text-academy-text hover:bg-academy-subtle`}
          >
            <UserCircle className="h-5 w-5" aria-hidden="true" />
            Cuenta
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          {accountMenuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-af-md border border-academy-border bg-academy-surface p-2 shadow-af-elevated">
              <button type="button" role="menuitem" onClick={() => onNavigate('account')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><UserCircle className="h-4 w-4" aria-hidden="true" />Mi cuenta</button>
              <button type="button" role="menuitem" onClick={() => onNavigate('referrals')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><Gift className="h-4 w-4" aria-hidden="true" />Referidos</button>
              {isAdmin && <button type="button" role="menuitem" onClick={() => onNavigate('admin')} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Administración</button>}
              <button type="button" role="menuitem" onClick={onOpenChangePassword} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"><KeyRound className="h-4 w-4" aria-hidden="true" />Cambiar contraseña</button>
              <button type="button" role="menuitem" onClick={onSignOut} className="flex min-h-touch w-full items-center gap-2 rounded-af-sm px-3 text-left text-af-body-sm text-academy-danger hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-danger"><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={onOpenAuth} className={`${navigationClass} bg-academy-primary text-white hover:bg-academy-primary-strong`}>
          Ingresar
        </button>
      )}

      <CartButton totalItems={totalItems} onOpenCart={onOpenCart} />
    </div>
  );
}

interface MobileNavigationProps extends NavigationProps {
  userPresent: boolean;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onOpenChangePassword: () => void;
  onSignOut: () => void;
}

export function MobileNavigation({ userPresent, isAdmin, onNavigate, onNavigateToSection, onOpenAuth, onOpenChangePassword, onSignOut }: MobileNavigationProps) {
  return (
    <nav id="mobile-navigation" aria-label="Navegación móvil">
      <div className="space-y-1">
        <button type="button" onClick={() => onNavigate('catalog')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Servicios</button>
        <button type="button" onClick={() => onNavigateToSection('how-it-works')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Cómo funciona</button>
        <p className="px-3 pt-3 text-af-label-sm uppercase tracking-wider text-academy-text-muted">Nosotros</p>
        {([['about', 'Quiénes Somos'], ['mission', 'Misión'], ['vision', 'Visión']] as const).map(([page, label]) => (
          <button key={page} type="button" onClick={() => onNavigate(page)} className={`${navigationClass} w-full pl-6 text-academy-text hover:bg-academy-subtle`}>{label}</button>
        ))}
        <button type="button" onClick={() => onNavigateToSection('help')} className={`${navigationClass} w-full text-academy-text hover:bg-academy-subtle`}>Ayuda</button>
      </div>

      <div className="mt-3 space-y-1 border-t border-academy-border pt-3">
        {userPresent && <button type="button" onClick={() => onNavigate('orders')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><ClipboardList className="h-4 w-4" aria-hidden="true" />Mis órdenes</button>}
        {userPresent && <button type="button" onClick={() => onNavigate('account')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><UserCircle className="h-4 w-4" aria-hidden="true" />Mi cuenta</button>}
        {userPresent && <button type="button" onClick={() => onNavigate('referrals')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><Gift className="h-4 w-4" aria-hidden="true" />Referidos</button>}
        {isAdmin && <button type="button" onClick={() => onNavigate('admin')} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Administración</button>}
        {userPresent ? (
          <>
            <button type="button" onClick={onOpenChangePassword} className={`${navigationClass} w-full gap-2 text-academy-text hover:bg-academy-subtle`}><KeyRound className="h-4 w-4" aria-hidden="true" />Cambiar contraseña</button>
            <button type="button" onClick={onSignOut} className={`${navigationClass} w-full gap-2 text-academy-danger hover:bg-red-50`}><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</button>
          </>
        ) : (
          <button type="button" onClick={onOpenAuth} className={`${navigationClass} w-full justify-center bg-academy-primary text-white hover:bg-academy-primary-strong`}>Ingresar</button>
        )}
      </div>
    </nav>
  );
}
