import { Check, ShoppingCart } from 'lucide-react';
import type { Category, Service } from '../lib/database.types';
import { Badge, Button, Card, CardContent, CardFooter } from './ui';

interface ServiceCardProps {
  service: Service;
  category?: Category;
  added?: boolean;
  onSelect: (service: Service) => void;
}

export function ServiceCard({ added = false, category, onSelect, service }: ServiceCardProps) {
  const unavailable = !category;

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-af-elevated">
      <CardContent className="flex flex-1 flex-col">
        <Badge variant="primary" className="mb-4 self-start">
          {category?.name ?? 'Categoría no disponible'}
        </Badge>
        <h3 className="text-af-h4 text-academy-text">{service.name}</h3>
        {service.description && (
          <p className="mt-3 flex-1 text-af-body-sm leading-6 text-academy-text-muted">
            {service.description}
          </p>
        )}
        <p className="mt-5 text-af-h3 text-academy-primary">
          ${service.price.toFixed(2)}
        </p>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={added || unavailable ? 'secondary' : 'primary'}
          disabled={added || unavailable}
          leadingIcon={added ? <Check className="h-4 w-4" aria-hidden="true" /> : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
          onClick={() => onSelect(service)}
        >
          {unavailable ? 'Categoría no disponible' : added ? 'Agregado' : 'Seleccionar servicio'}
        </Button>
      </CardFooter>
    </Card>
  );
}
