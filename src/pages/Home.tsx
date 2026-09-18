import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Gift,
  HelpCircle,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { ServiceCustomizationModal } from '../components/ServiceCustomizationModal';
import { ServiceCard } from '../components/ServiceCard';
import { Alert, Badge, Button, Card, CardContent, EmptyState } from '../components/ui';
import type { Category, Service } from '../lib/database.types';
import type { ServiceDetails as ServiceDetailsType } from '../lib/serviceCustomization';
import type { Page } from '../App';

interface HomeProps {
  onOpenAuth: () => void;
  onNavigate: (page: Page) => void;
}

const categoryImages: Record<string, string> = {
  'ALEKS Universidad': '/images/categories/aleks-universidad.webp',
  'ALEKS Preparatoria': '/images/categories/aleks-preparatoria.webp',
  'CAMBRIDGE ONE': '/images/categories/cambridge-one.webp',
  'Coursera Excel': '/images/categories/coursera-excel.webp',
  'National Geographic Learning': '/images/categories/national-geographic-learning.webp',
};

const trustItems = [
  { icon: CheckCircle2, label: 'Precios claros' },
  { icon: CreditCard, label: 'Pago procesado de forma segura con Stripe' },
  { icon: ClipboardList, label: 'Seguimiento de tu pedido' },
  { icon: MessageCircle, label: 'Soporte desde Academy Flow' },
];

const howItWorks = [
  { icon: Search, title: 'Explora los servicios', description: 'Revisa las opciones activas y elige la que corresponde a tu solicitud.' },
  { icon: SlidersHorizontal, title: 'Personaliza tu solicitud', description: 'Comparte los datos necesarios para recibir el acompañamiento adecuado.' },
  { icon: CreditCard, title: 'Realiza tu pago', description: 'Confirma tu pedido mediante el flujo de pago disponible en Academy Flow.' },
  { icon: ClipboardList, title: 'Consulta el seguimiento de tu orden', description: 'Revisa el estado de tu solicitud desde la sección Mis órdenes.' },
];

function scrollToSection(sectionId: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

export function Home({ onNavigate, onOpenAuth }: HomeProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [modalService, setModalService] = useState<Service | null>(null);
  const [modalCategory, setModalCategory] = useState<Category | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const { addToCart } = useCart();
  const { user } = useAuth();

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      const [categoriesResult, servicesResult] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('services').select('*').eq('is_active', true).order('name'),
      ]);

      if (!active) return;
      if (categoriesResult.error || servicesResult.error) {
        setLoadError('No pudimos cargar los servicios en este momento. Intenta de nuevo más tarde.');
      } else {
        setCategories(categoriesResult.data ?? []);
        setServices(servicesResult.data ?? []);
        setLoadError(null);
      }
      setLoading(false);
    };

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  const handleAddClick = (service: Service) => {
    if (!user) {
      onOpenAuth();
      return;
    }

    const category = categories.find((item) => item.id === service.category_id);
    if (!category) return;

    setModalMessage(null);
    setModalService(service);
    setModalCategory(category);
  };

  const handleModalConfirm = async (details: ServiceDetailsType, quantity: number) => {
    if (!modalService || !modalCategory) return;

    const serviceId = modalService.id;
    const result = await addToCart(
      serviceId,
      modalService.name,
      modalCategory.name,
      details,
      quantity,
    );

    if (result.success) {
      setAddedItems((previous) => new Set(previous).add(serviceId));
      window.setTimeout(() => {
        setAddedItems((previous) => {
          const next = new Set(previous);
          next.delete(serviceId);
          return next;
        });
      }, 2000);
      setModalService(null);
      setModalCategory(null);
    } else {
      setModalMessage(result.message ?? 'No se pudo agregar al carrito');
    }
  };

  const displayedServices = services.slice(0, 6);

  return (
    <div className="overflow-x-hidden bg-academy-background text-academy-text">
      <section className="relative overflow-hidden border-b border-academy-border bg-academy-surface">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-br from-blue-50 via-white to-slate-100 lg:block" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-28">
          <div>
            <Badge variant="primary">APOYO ACADÉMICO PERSONALIZADO</Badge>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight text-academy-text sm:text-af-display-xl">
              Avanza en tus estudios con el apoyo que necesitas
            </h1>
            <p className="mt-6 max-w-2xl text-af-body-lg text-academy-text-muted">
              Encuentra acompañamiento académico para ALEKS, Cambridge One y otras plataformas educativas, con precios claros y seguimiento de tu pedido.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" trailingIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />} onClick={() => onNavigate('catalog')}>
                Explorar servicios
              </Button>
              <Button size="lg" variant="secondary" onClick={() => scrollToSection('how-it-works')}>
                Cómo funciona
              </Button>
            </div>
          </div>

          <Card className="border-blue-100 bg-gradient-to-br from-academy-primary to-academy-primary-strong text-white shadow-af-elevated">
            <CardContent className="p-7 sm:p-9">
              <BookOpen className="h-10 w-10" aria-hidden="true" />
              <h2 className="mt-6 text-af-h3">Un flujo claro de principio a fin</h2>
              <ul className="mt-6 space-y-4 text-blue-50">
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Servicios y precios consultados directamente desde Academy Flow.</span></li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Personalización antes de agregar cada servicio al carrito.</span></li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>Consulta del estado de tus órdenes desde tu cuenta.</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-label="Confianza" className="border-b border-academy-border bg-academy-surface">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {trustItems.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-af-md bg-academy-subtle p-4">
              <Icon className="h-5 w-5 shrink-0 text-academy-primary" aria-hidden="true" />
              <span className="text-af-label text-academy-text">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <div>
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <Badge variant="neutral">PLATAFORMAS</Badge>
              <h2 className="mt-4 text-af-h2 text-academy-text">Explora por categoría</h2>
              <p className="mt-3 max-w-2xl text-academy-text-muted">Encuentra las categorías disponibles actualmente en Academy Flow.</p>
            </div>
            <Button variant="ghost" trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />} onClick={() => onNavigate('catalog')}>
              Ver catálogo completo
            </Button>
          </div>

          {loading ? (
            <div role="status" className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <span className="sr-only">Cargando categorías</span>
              {[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-af-lg bg-slate-200" />)}
            </div>
          ) : loadError ? (
            <Alert variant="error" role="alert" className="mt-8">{loadError}</Alert>
          ) : categories.length === 0 ? (
            <EmptyState className="mt-8" icon={<BookOpen className="h-9 w-9" />} title="No hay categorías disponibles" description="Vuelve a consultar más tarde." />
          ) : (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => {
                const image = categoryImages[category.name];
                return (
                  <Card key={category.id} className="group overflow-hidden">
                    <div className="flex h-40 items-center justify-center bg-academy-subtle p-6">
                      {image ? (
                        <>
                          <img
                            src={image}
                            alt={`Identidad visual de ${category.name}`}
                            className="max-h-full max-w-full object-contain transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                              event.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <BookOpen className="hidden h-12 w-12 text-academy-primary" aria-label={category.name} />
                        </>
                      ) : (
                        <BookOpen className="h-12 w-12 text-academy-primary" aria-hidden="true" />
                      )}
                    </div>
                    <CardContent>
                      <h3 className="text-af-h4">{category.name}</h3>
                      {category.description && <p className="mt-2 text-af-body-sm text-academy-text-muted">{category.description}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-academy-surface py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <Badge variant="primary">SERVICIOS</Badge>
                <h2 className="mt-4 text-af-h2">Servicios disponibles</h2>
                <p className="mt-3 max-w-2xl text-academy-text-muted">Selecciona un servicio activo y personaliza tu solicitud antes de agregarla al carrito.</p>
              </div>
              <Button variant="secondary" onClick={() => onNavigate('catalog')}>Explorar todos</Button>
            </div>

            {!loading && !loadError && displayedServices.length > 0 && (
              <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {displayedServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    category={categories.find((category) => category.id === service.category_id)}
                    added={addedItems.has(service.id)}
                    onSelect={handleAddClick}
                  />
                ))}
              </div>
            )}
            {!loading && !loadError && displayedServices.length === 0 && (
              <EmptyState className="mt-8" icon={<Search className="h-9 w-9" />} title="No hay servicios disponibles" description="Vuelve a consultar más tarde." />
            )}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="neutral">CÓMO FUNCIONA</Badge>
              <h2 className="mt-4 text-af-h2">De la elección al seguimiento</h2>
              <p className="mt-3 text-academy-text-muted">Un proceso sencillo para preparar tu solicitud y consultar su avance.</p>
            </div>
            <ol className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {howItWorks.map(({ description, icon: Icon, title }, index) => (
                <li key={title} className="relative rounded-af-lg border border-academy-border bg-academy-surface p-6 shadow-af-card">
                  <span className="absolute right-5 top-5 text-af-label-sm text-academy-text-muted">0{index + 1}</span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-af-md bg-blue-100 text-academy-primary"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                  <h3 className="mt-5 text-af-h4">{title}</h3>
                  <p className="mt-2 text-af-body-sm text-academy-text-muted">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-slate-950 py-16 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
            <div>
              <ShieldCheck className="h-10 w-10 text-blue-300" aria-hidden="true" />
              <h2 className="mt-5 text-af-h2">Claridad y seguimiento en cada pedido</h2>
              <p className="mt-4 text-slate-300">Los servicios muestran precios provenientes de Academy Flow, el pago se procesa con Stripe y puedes consultar el estado de tu orden desde tu cuenta.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-af-lg border border-white/15 bg-white/5 p-5"><CreditCard className="h-6 w-6 text-blue-300" aria-hidden="true" /><p className="mt-3 font-semibold">Pago procesado de forma segura con Stripe</p></div>
              <div className="rounded-af-lg border border-white/15 bg-white/5 p-5"><ClipboardList className="h-6 w-6 text-blue-300" aria-hidden="true" /><p className="mt-3 font-semibold">Seguimiento desde Mis órdenes</p></div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
            <div className="flex h-48 items-center justify-center rounded-af-lg bg-blue-100 text-academy-primary"><Gift className="h-20 w-20" aria-hidden="true" /></div>
            <div>
              <Badge variant="primary">REFERIDOS</Badge>
              <h2 className="mt-4 text-af-h2">Comparte Academy Flow</h2>
              <p className="mt-3 text-academy-text-muted">Consulta tu código y su historial desde la sección de referidos. Si recibiste un código válido, puedes aplicarlo durante el checkout.</p>
              <Button className="mt-6" variant="secondary" onClick={() => onNavigate('referrals')}>Ver mis referidos</Button>
            </div>
          </div>
        </section>

        <section id="help" className="scroll-mt-24 bg-academy-surface py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <HelpCircle className="mx-auto h-9 w-9 text-academy-primary" aria-hidden="true" />
              <h2 className="mt-4 text-af-h2">Preguntas frecuentes</h2>
            </div>
            <div className="mt-8 divide-y divide-academy-border rounded-af-lg border border-academy-border bg-academy-surface px-5 shadow-af-card">
              {[
                ['¿Cómo elijo un servicio?', 'Explora el catálogo, selecciona una opción activa y completa los datos solicitados antes de agregarla al carrito.'],
                ['¿Cómo puedo revisar mis órdenes?', 'Cuando hayas iniciado sesión, abre Mis órdenes para consultar el estado de tus solicitudes.'],
                ['¿Cómo funciona el pago?', 'El pago se procesa mediante Stripe dentro del flujo de checkout de Academy Flow.'],
                ['¿Qué hago si necesito ayuda?', 'Puedes abrir el soporte de Academy Flow desde el botón de ayuda disponible en la aplicación.'],
              ].map(([question, answer]) => (
                <details key={question} className="group py-4">
                  <summary className="min-h-touch cursor-pointer list-none py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">{question}</summary>
                  <p className="pb-3 pr-6 text-af-body-sm text-academy-text-muted">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-af-lg bg-academy-primary px-6 py-10 text-center text-white shadow-af-elevated sm:px-10">
              <h2 className="text-af-h2">Encuentra el apoyo adecuado para tu solicitud</h2>
              <p className="mx-auto mt-3 max-w-2xl text-blue-100">Consulta los servicios activos, revisa sus precios y personaliza tu pedido.</p>
              <Button className="mt-7 bg-white text-academy-primary hover:bg-blue-50" size="lg" onClick={() => onNavigate('catalog')}>Explorar servicios</Button>
            </div>
          </div>
        </section>
      </div>

      {modalService && modalCategory && (
        <ServiceCustomizationModal
          service={modalService}
          category={modalCategory}
          mode="add"
          onConfirm={handleModalConfirm}
          onClose={() => {
            setModalService(null);
            setModalCategory(null);
            setModalMessage(null);
          }}
        />
      )}

      {modalMessage && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-af-md border border-amber-300 bg-amber-50 px-6 py-3 text-amber-900 shadow-af-elevated">
          {modalMessage}
        </div>
      )}
    </div>
  );
}
