import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  ReceiptText,
  UserRound,
  Users,
} from 'lucide-react';
import { Drawer } from '../ui';

export type AdminSectionId =
  | 'dashboard'
  | 'services'
  | 'orders'
  | 'support'
  | 'credentials'
  | 'activity'
  | 'referrals';

interface AdminShellProps {
  activeSection: AdminSectionId;
  adminEmail?: string | null;
  children: ReactNode;
  onBackToSite: () => void;
  onOpenAccount: () => void;
  onSectionChange: (section: AdminSectionId) => void;
}

const adminSections: {
  id: AdminSectionId;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
  { id: 'services', label: 'Servicios', icon: BookOpen },
  { id: 'orders', label: 'Órdenes', icon: ReceiptText },
  { id: 'support', label: 'Soporte', icon: LifeBuoy },
  { id: 'credentials', label: 'Credenciales', icon: KeyRound },
  { id: 'activity', label: 'Actividad', icon: Activity },
  { id: 'referrals', label: 'Referidos', icon: Users },
];

export function AdminShell({
  activeSection,
  adminEmail,
  children,
  onBackToSite,
  onOpenAccount,
  onSectionChange,
}: AdminShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const activeLabel = adminSections.find((section) => section.id === activeSection)?.label ?? 'Resumen';
  const identity = adminEmail?.trim() || 'Administrador';

  const selectSection = (section: AdminSectionId) => {
    onSectionChange(section);
    setMobileNavigationOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const renderNavigation = (mobile = false) => (
    <nav aria-label="Navegación administrativa" className={mobile ? 'space-y-1' : 'space-y-1.5'}>
      {adminSections.map(({ id, label, icon: Icon }) => {
        const active = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => selectSection(id)}
            className={`flex w-full items-center gap-3 rounded-af-md px-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
              mobile ? 'min-h-[52px]' : 'min-h-touch'
            } ${active
              ? 'bg-academy-primary text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {mobile && <span className="text-lg font-normal text-slate-500" aria-hidden="true">›</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-academy-background font-academy text-academy-text">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#0F172A] px-4 py-6 lg:flex">
        <div className="flex min-h-9 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-af-md bg-academy-primary text-white">
            <GraduationCap className="h-[21px] w-[21px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-white">Academy Flow</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-300">Administración</p>
          </div>
        </div>

        <div className="mt-7">{renderNavigation()}</div>

        <div className="mt-auto space-y-1.5 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={onBackToSite}
            className="flex min-h-touch w-full items-center gap-3 rounded-af-md px-3 text-left text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <ArrowLeft className="h-[18px] w-[18px] text-slate-400" aria-hidden="true" />
            Volver al sitio
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex min-h-touch w-full items-center gap-3 rounded-af-md px-3 text-left text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <UserRound className="h-[18px] w-[18px] text-slate-400" aria-hidden="true" />
            Mi cuenta
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[248px]">
        <header className="sticky top-0 z-30 hidden h-[72px] items-center justify-between border-b border-academy-border bg-white px-8 lg:flex">
          <p className="text-xs text-academy-text-muted">
            Administración <span className="px-1.5 text-slate-300">/</span>{' '}
            <span className="font-semibold text-academy-text">{activeLabel}</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-af-md bg-blue-100 text-xs font-bold text-blue-700">
              AD
            </span>
            <div className="max-w-52 text-right">
              <p className="truncate text-xs font-bold text-academy-text">{identity}</p>
              <p className="text-[10px] text-academy-text-muted">Administrador · AAL2</p>
            </div>
          </div>
        </header>

        <header className="sticky top-0 z-40 flex h-[68px] items-center justify-between bg-[#0F172A] px-5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-academy-primary text-white">
              <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold leading-4 text-white">Academy Flow</p>
              <p className="text-[11px] leading-4 text-slate-400">Administración</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Abrir navegación administrativa"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-af-md bg-white/[0.08] text-white transition hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        </header>

        <main className="min-w-0 px-5 py-9 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <Drawer
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        side="left"
        title="Navegación"
        ariaLabel="Navegación administrativa"
        overlayClassName="!top-[68px] bg-slate-950/30"
        className="h-full !max-w-[390px] !bg-[#0F172A] text-white"
        headerClassName="!border-0 !px-5 !pb-0 !pt-5"
        titleClassName="text-xl text-white"
        closeButtonClassName="bg-white/[0.08] text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:ring-blue-300"
        bodyClassName="!px-5 !pb-5 !pt-1"
      >
        {renderNavigation(true)}
        <div className="mt-5 space-y-1 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={() => {
              setMobileNavigationOpen(false);
              onBackToSite();
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-af-md px-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            Volver al sitio
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileNavigationOpen(false);
              onOpenAccount();
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-af-md px-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <UserRound className="h-[18px] w-[18px]" aria-hidden="true" />
            Mi cuenta
          </button>
        </div>
      </Drawer>
    </div>
  );
}
