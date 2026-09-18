import { BookOpen } from 'lucide-react';
import type { Page } from '../App';

interface FooterProps {
  onNavigate: (page: Page) => void;
  onNavigateToHomeSection: (sectionId: string) => void;
}

const footerButtonClass = 'min-h-touch rounded-af-sm text-left text-af-body-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300';

export function Footer({ onNavigate, onNavigateToHomeSection }: FooterProps) {
  return (
    <footer className="mt-auto bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <button type="button" onClick={() => onNavigate('home')} className="flex min-h-touch items-center gap-2 rounded-af-md text-xl font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
              <span className="flex h-9 w-9 items-center justify-center rounded-af-md bg-academy-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
              Academy Flow
            </button>
            <p className="mt-4 max-w-md text-af-body-sm leading-6 text-slate-400">
              Acompañamiento académico para distintas plataformas educativas, con servicios y precios claros.
            </p>
          </div>

          <div>
            <h2 className="text-af-label uppercase tracking-wider text-white">Explorar</h2>
            <div className="mt-4 flex flex-col">
              <button type="button" onClick={() => onNavigate('catalog')} className={footerButtonClass}>Servicios</button>
              <button type="button" onClick={() => onNavigateToHomeSection('how-it-works')} className={footerButtonClass}>Cómo funciona</button>
              <button type="button" onClick={() => onNavigate('about')} className={footerButtonClass}>Quiénes Somos</button>
              <button type="button" onClick={() => onNavigate('policies')} className={footerButtonClass}>Políticas</button>
            </div>
          </div>

          <div>
            <h2 className="text-af-label uppercase tracking-wider text-white">Ayuda</h2>
            <div className="mt-4 flex flex-col">
              <button type="button" onClick={() => onNavigateToHomeSection('help')} className={footerButtonClass}>Preguntas frecuentes</button>
              <button type="button" onClick={() => onNavigate('orders')} className={footerButtonClass}>Mis órdenes</button>
              <button type="button" onClick={() => onNavigate('referrals')} className={footerButtonClass}>Referidos</button>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-800 pt-6 text-af-body-sm text-slate-400">
          <p>&copy; {new Date().getFullYear()} Academy Flow. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
