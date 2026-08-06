/*
  # Seed Categories

  Inserts the five educational platform categories.
  Idempotent: uses WHERE NOT EXISTS to avoid duplicates.
  Does not modify existing data, RLS policies, or privileges.
*/

INSERT INTO public.categories (name, description)
SELECT 'ALEKS Universidad', 'Servicios de asistencia para ALEKS Universidad'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'ALEKS Universidad'
);

INSERT INTO public.categories (name, description)
SELECT 'ALEKS Preparatoria', 'Servicios de asistencia para ALEKS Preparatoria'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'ALEKS Preparatoria'
);

INSERT INTO public.categories (name, description)
SELECT 'CAMBRIDGE ONE', 'Servicios de asistencia para Cambridge One'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'CAMBRIDGE ONE'
);

INSERT INTO public.categories (name, description)
SELECT 'Coursera Excel', 'Servicios de asistencia para Coursera Excel'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'Coursera Excel'
);

INSERT INTO public.categories (name, description)
SELECT 'National Geographic Learning', 'Servicios de asistencia para National Geographic Learning'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'National Geographic Learning'
);
