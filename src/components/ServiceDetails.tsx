import type { Json } from '../lib/database.types';
import { formatDetailsLabels } from '../lib/serviceCustomization';

interface ServiceDetailsProps {
  serviceName: string;
  categoryName: string;
  details: Json | undefined | null;
}

export function ServiceDetails({ serviceName, categoryName, details }: ServiceDetailsProps) {
  const labels = formatDetailsLabels(serviceName, categoryName, details);

  if (labels.length === 0) {
    return <p className="text-sm text-gray-400 italic">Sin personalización</p>;
  }

  return (
    <dl className="space-y-1">
      {labels.map(({ label, value }) => (
        <div key={label} className="flex gap-2 text-sm">
          <dt className="text-gray-500 font-medium whitespace-nowrap">{label}:</dt>
          <dd className="text-gray-800 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
