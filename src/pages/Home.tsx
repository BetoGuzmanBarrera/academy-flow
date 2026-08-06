import { useEffect, useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import type { Category, Service } from '../lib/database.types';

interface HomeProps {
  onOpenAuth: () => void;
}

const categoryImages: Record<string, string> = {
  'ALEKS Universidad': '/images/categories/aleks-universidad.webp',
  'ALEKS Preparatoria': '/images/categories/aleks-preparatoria.webp',
  'CAMBRIDGE ONE': '/images/categories/cambridge-one.webp',
  'Coursera Excel': '/images/categories/coursera-excel.webp',
  'National Geographic Learning': '/images/categories/national-geographic-learning.webp',
};

export function Home({ onOpenAuth }: HomeProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const { addToCart } = useCart();
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [categoriesResult, servicesResult] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('services').select('*').eq('is_active', true).order('name'),
    ]);

    if (categoriesResult.data) setCategories(categoriesResult.data);
    if (servicesResult.data) setServices(servicesResult.data);
    setLoading(false);
  };

  const handleAddToCart = async (serviceId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }

    await addToCart(serviceId);
    setAddedItems(prev => new Set(prev).add(serviceId));
    setTimeout(() => {
      setAddedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(serviceId);
        return newSet;
      });
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Servicios Educativos de Calidad
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-blue-100">
            Encuentra el servicio académico que necesitas
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {categories.map((category, index) => {
          const categoryServices = services.filter(s => s.category_id === category.id);

          if (categoryServices.length === 0) return null;

          const categoryImage = categoryImages[category.name];
          const isEven = index % 2 === 0;

          return (
            <section key={category.id} className="mb-20">
              <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-8 items-center bg-white rounded-2xl shadow-lg overflow-hidden`}>
                <div className="lg:w-1/2">
                  {categoryImage ? (
                    <img
                      src={categoryImage}
                      alt={category.name}
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.style.display = 'none';
                        const fallback = img.nextElementSibling;
                        if (fallback) fallback.classList.remove('hidden');
                      }}
                      className="w-full h-80 object-cover"
                    />
                  ) : (
                    <div className="w-full h-80 bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500 text-lg font-medium text-center px-4">{category.name}</span>
                    </div>
                  )}
                  {categoryImage && (
                    <div className="hidden w-full h-80 bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500 text-lg font-medium text-center px-4">{category.name}</span>
                    </div>
                  )}
                </div>

                <div className="lg:w-1/2 p-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">{category.name}</h2>
                  {category.description && (
                    <p className="text-gray-600 mb-6">{category.description}</p>
                  )}

                  <div className="space-y-4">
                    {categoryServices.map((service) => {
                      const isAdded = addedItems.has(service.id);

                      return (
                        <div
                          key={service.id}
                          className="bg-gray-50 rounded-lg p-5 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                {service.name}
                              </h3>
                              {service.description && (
                                <p className="text-gray-600 text-sm mb-3">{service.description}</p>
                              )}
                              <span className="text-2xl font-bold text-blue-600">
                                ${service.price.toFixed(2)}
                              </span>
                            </div>

                            <button
                              onClick={() => handleAddToCart(service.id)}
                              disabled={isAdded}
                              className={`${
                                isAdded
                                  ? 'bg-green-500 hover:bg-green-600'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              } text-white px-4 py-2 rounded-lg transition flex items-center space-x-2 ml-4 whitespace-nowrap`}
                            >
                              {isAdded ? (
                                <>
                                  <Check size={18} />
                                  <span>Agregado</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingCart size={18} />
                                  <span>Agregar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
