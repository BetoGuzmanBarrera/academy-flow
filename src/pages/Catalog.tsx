import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, SearchX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { ServiceCustomizationModal } from '../components/ServiceCustomizationModal';
import { ServiceCard } from '../components/ServiceCard';
import { Alert, Badge, Button, EmptyState, SearchBar, Select } from '../components/ui';
import type { Category, Service } from '../lib/database.types';
import type { ServiceDetails as ServiceDetailsType } from '../lib/serviceCustomization';

interface CatalogProps {
  onOpenAuth: () => void;
}

export function Catalog({ onOpenAuth }: CatalogProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [modalService, setModalService] = useState<Service | null>(null);
  const [modalCategory, setModalCategory] = useState<Category | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const { user } = useAuth();
  const { addToCart } = useCart();

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setLoading(true);
      setLoadError(null);
      const [categoriesResult, servicesResult] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('services').select('*').eq('is_active', true).order('name'),
      ]);

      if (!active) return;
      if (categoriesResult.error || servicesResult.error) {
        setLoadError('No pudimos cargar el catálogo. Intenta nuevamente.');
      } else {
        setCategories(categoriesResult.data ?? []);
        setServices(servicesResult.data ?? []);
      }
      setLoading(false);
    };

    void loadCatalog();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('es-MX');
    return services.filter((service) => {
      const category = service.category_id ? categoriesById.get(service.category_id) : undefined;
      const matchesCategory = categoryFilter === 'all' || service.category_id === categoryFilter;
      const searchableText = [service.name, service.description ?? '', category?.name ?? '']
        .join(' ')
        .toLocaleLowerCase('es-MX');
      return matchesCategory && searchableText.includes(normalizedSearch);
    });
  }, [categoriesById, categoryFilter, searchTerm, services]);

  const handleAddClick = (service: Service) => {
    if (!user) {
      onOpenAuth();
      return;
    }

    const category = service.category_id ? categoriesById.get(service.category_id) : undefined;
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

  const resultLabel = `${filteredServices.length} ${filteredServices.length === 1 ? 'servicio' : 'servicios'}`;

  return (
    <div className="min-h-full overflow-x-hidden bg-academy-background">
      <header className="border-b border-academy-border bg-academy-surface">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Badge variant="primary">CATÁLOGO</Badge>
          <h1 className="mt-4 text-4xl font-bold text-academy-text sm:text-af-h1">Servicios académicos</h1>
          <p className="mt-4 max-w-2xl text-af-body-lg text-academy-text-muted">
            Consulta los servicios activos, compara sus precios y elige una opción para personalizar tu solicitud.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section aria-labelledby="catalog-filters" className="rounded-af-lg border border-academy-border bg-academy-surface p-5 shadow-af-card sm:p-6">
          <h2 id="catalog-filters" className="text-af-h4 text-academy-text">Buscar y filtrar</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_16rem]">
            <div>
              <label htmlFor="catalog-search" className="mb-1.5 block text-af-label text-academy-text">Buscar servicios</label>
              <SearchBar
                id="catalog-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onClear={() => setSearchTerm('')}
                placeholder="Nombre, descripción o categoría"
              />
            </div>
            <div className="md:hidden">
              <Select label="Categoría" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Todas las categorías</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </div>
            <div className="hidden md:block">
              <p className="mb-1.5 text-af-label text-academy-text">Categoría</p>
              <p className="flex min-h-touch items-center text-af-body-sm text-academy-text-muted">
                Selecciona una categoría en los filtros inferiores.
              </p>
            </div>
          </div>
          <div className="mt-5 hidden max-w-full gap-2 overflow-x-auto pb-2 md:flex" aria-label="Filtrar por categoría">
            <Button
              size="sm"
              variant={categoryFilter === 'all' ? 'primary' : 'secondary'}
              aria-pressed={categoryFilter === 'all'}
              className="shrink-0"
              onClick={() => setCategoryFilter('all')}
            >
              Todas
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={categoryFilter === category.id ? 'primary' : 'secondary'}
                aria-pressed={categoryFilter === category.id}
                className="shrink-0"
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="text-af-h3 text-academy-text">Resultados</h2>
          {!loading && !loadError && <p className="text-af-label text-academy-text-muted" aria-live="polite">{resultLabel}</p>}
        </div>

        {loading ? (
          <div role="status" className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <span className="sr-only">Cargando servicios</span>
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-80 animate-pulse rounded-af-lg bg-slate-200" />)}
          </div>
        ) : loadError ? (
          <div className="mt-6">
            <Alert variant="error" role="alert">{loadError}</Alert>
            <Button className="mt-4" variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={() => setReloadKey((value) => value + 1)}>
              Reintentar
            </Button>
          </div>
        ) : filteredServices.length === 0 ? (
          <EmptyState
            className="mt-6 bg-academy-surface"
            icon={<SearchX className="h-10 w-10" />}
            title="No encontramos servicios"
            description="Prueba con otro término o cambia la categoría seleccionada."
            action={(
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('all');
                }}
              >
                Limpiar filtros
              </Button>
            )}
          />
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                category={service.category_id ? categoriesById.get(service.category_id) : undefined}
                added={addedItems.has(service.id)}
                onSelect={handleAddClick}
              />
            ))}
          </div>
        )}

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
