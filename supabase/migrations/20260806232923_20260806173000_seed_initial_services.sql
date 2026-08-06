BEGIN;

-- ============================================================
-- 1. Desactivar servicio de prueba
-- ============================================================
UPDATE public.services
SET is_active = false
WHERE name = 'Servicio de prueba ALEKS';

-- ============================================================
-- 2. Crear categoría Francés — Biblio Exos si no existe
-- ============================================================
INSERT INTO public.categories (name, description)
SELECT 'Francés — Biblio Exos',
       'Servicios de asesoría y acompañamiento para actividades de francés.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories WHERE name = 'Francés — Biblio Exos'
);

-- ============================================================
-- 3. ALEKS Universidad — 7 servicios
-- ============================================================

-- Servicio 1: Preparación para examen parcial
UPDATE public.services
SET description = 'Asesoría para repasar contenidos, resolver dudas y prepararse para un examen parcial de ALEKS de aproximadamente 25 preguntas. Disponible para cualquiera de los tres parciales. El estudiante presenta personalmente su evaluación.',
    price = 500,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Preparación para examen parcial';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Preparación para examen parcial',
       'Asesoría para repasar contenidos, resolver dudas y prepararse para un examen parcial de ALEKS de aproximadamente 25 preguntas. Disponible para cualquiera de los tres parciales. El estudiante presenta personalmente su evaluación.',
       500, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Preparación para examen parcial'
  );

-- Servicio 2: Preparación para examen final
UPDATE public.services
SET description = 'Sesión intensiva de preparación para el examen final de ALEKS, que puede contener aproximadamente 60 preguntas. Incluye repaso de los temas principales y resolución guiada de ejercicios similares. El estudiante presenta personalmente su evaluación.',
    price = 900,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Preparación para examen final';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Preparación para examen final',
       'Sesión intensiva de preparación para el examen final de ALEKS, que puede contener aproximadamente 60 preguntas. Incluye repaso de los temas principales y resolución guiada de ejercicios similares. El estudiante presenta personalmente su evaluación.',
       900, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Preparación para examen final'
  );

-- Servicio 3: Acompañamiento por tema de parcial
UPDATE public.services
SET description = 'Explicación paso a paso y apoyo para comprender un tema asignado en ALEKS. Una materia puede incluir aproximadamente 196 temas, aunque la cantidad puede variar. El precio corresponde a un tema.',
    price = 8,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Acompañamiento por tema de parcial';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Acompañamiento por tema de parcial',
       'Explicación paso a paso y apoyo para comprender un tema asignado en ALEKS. Una materia puede incluir aproximadamente 196 temas, aunque la cantidad puede variar. El precio corresponde a un tema.',
       8, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Acompañamiento por tema de parcial'
  );

-- Servicio 4: Preparación para Verificación Inicial de Conocimientos
UPDATE public.services
SET description = 'Asesoría para prepararse para la verificación inicial de aproximadamente 25 preguntas. Un buen desempeño puede reducir la cantidad de temas asignados por ALEKS, pero el resultado depende exclusivamente del estudiante.',
    price = 500,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Preparación para Verificación Inicial de Conocimientos';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Preparación para Verificación Inicial de Conocimientos',
       'Asesoría para prepararse para la verificación inicial de aproximadamente 25 preguntas. Un buen desempeño puede reducir la cantidad de temas asignados por ALEKS, pero el resultado depende exclusivamente del estudiante.',
       500, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Preparación para Verificación Inicial de Conocimientos'
  );

-- Servicio 5: Asesoría para tareas colaborativas
UPDATE public.services
SET description = 'Apoyo para comprender y resolver ejercicios similares a las actividades colaborativas de aproximadamente 10 a 15 preguntas. El precio corresponde a una actividad.',
    price = 20,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Asesoría para tareas colaborativas';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Asesoría para tareas colaborativas',
       'Apoyo para comprender y resolver ejercicios similares a las actividades colaborativas de aproximadamente 10 a 15 preguntas. El precio corresponde a una actividad.',
       20, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Asesoría para tareas colaborativas'
  );

-- Servicio 6: Asesoría para tareas individuales
UPDATE public.services
SET description = 'Orientación para comprender y resolver ejercicios similares a las actividades individuales de aproximadamente 5 a 10 preguntas. El precio corresponde a una actividad.',
    price = 10,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Asesoría para tareas individuales';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Asesoría para tareas individuales',
       'Orientación para comprender y resolver ejercicios similares a las actividades individuales de aproximadamente 5 a 10 preguntas. El precio corresponde a una actividad.',
       10, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Asesoría para tareas individuales'
  );

-- Servicio 7: Preparación para Verificación de Conocimientos
UPDATE public.services
SET description = 'Repaso y preparación para la evaluación que aparece al concluir un módulo o parcial. Un buen resultado puede reducir algunos temas posteriores, según el desempeño del estudiante.',
    price = 100,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'ALEKS Universidad')
  AND name = 'Preparación para Verificación de Conocimientos';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Preparación para Verificación de Conocimientos',
       'Repaso y preparación para la evaluación que aparece al concluir un módulo o parcial. Un buen resultado puede reducir algunos temas posteriores, según el desempeño del estudiante.',
       100, true
FROM public.categories c
WHERE c.name = 'ALEKS Universidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Preparación para Verificación de Conocimientos'
  );

-- ============================================================
-- 4. CAMBRIDGE ONE — 3 servicios
-- ============================================================

-- Servicio 1: Acompañamiento para Unidad Abierta
UPDATE public.services
SET description = 'Asesoría para comprender y avanzar en una unidad de Cambridge One, sin importar el nivel. El servicio se atiende dentro de las 48 a 72 horas posteriores a la compra.',
    price = 100,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'CAMBRIDGE ONE')
  AND name = 'Acompañamiento para Unidad Abierta';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Acompañamiento para Unidad Abierta',
       'Asesoría para comprender y avanzar en una unidad de Cambridge One, sin importar el nivel. El servicio se atiende dentro de las 48 a 72 horas posteriores a la compra.',
       100, true
FROM public.categories c
WHERE c.name = 'CAMBRIDGE ONE'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Acompañamiento para Unidad Abierta'
  );

-- Servicio 2: Guía de preparación para examen
UPDATE public.services
SET description = 'Elaboración de una guía de estudio en PDF para prepararse para una evaluación en SUMADI. El estudiante presenta personalmente el examen y debe respetar signos, mayúsculas, minúsculas y el formato solicitado por la plataforma.',
    price = 400,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'CAMBRIDGE ONE')
  AND name = 'Guía de preparación para examen';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Guía de preparación para examen',
       'Elaboración de una guía de estudio en PDF para prepararse para una evaluación en SUMADI. El estudiante presenta personalmente el examen y debe respetar signos, mayúsculas, minúsculas y el formato solicitado por la plataforma.',
       400, true
FROM public.categories c
WHERE c.name = 'CAMBRIDGE ONE'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Guía de preparación para examen'
  );

-- Servicio 3: Acompañamiento urgente de unidad
UPDATE public.services
SET description = 'Servicio prioritario de asesoría para una unidad de Cambridge One, con atención dentro de las siguientes 24 horas.',
    price = 150,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'CAMBRIDGE ONE')
  AND name = 'Acompañamiento urgente de unidad';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Acompañamiento urgente de unidad',
       'Servicio prioritario de asesoría para una unidad de Cambridge One, con atención dentro de las siguientes 24 horas.',
       150, true
FROM public.categories c
WHERE c.name = 'CAMBRIDGE ONE'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Acompañamiento urgente de unidad'
  );

-- ============================================================
-- 5. Francés — Biblio Exos — 2 servicios
-- ============================================================

-- Servicio 1: Acompañamiento semanal de francés
UPDATE public.services
SET description = 'Asesoría para comprender y avanzar en las actividades correspondientes a una semana de francés. El curso puede incluir aproximadamente 13 semanas. Tiempo de atención: 48 a 72 horas.',
    price = 80,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'Francés — Biblio Exos')
  AND name = 'Acompañamiento semanal de francés';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Acompañamiento semanal de francés',
       'Asesoría para comprender y avanzar en las actividades correspondientes a una semana de francés. El curso puede incluir aproximadamente 13 semanas. Tiempo de atención: 48 a 72 horas.',
       80, true
FROM public.categories c
WHERE c.name = 'Francés — Biblio Exos'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Acompañamiento semanal de francés'
  );

-- Servicio 2: Acompañamiento urgente de francés
UPDATE public.services
SET description = 'Servicio prioritario de asesoría para las actividades correspondientes a una semana de francés, con atención dentro de las siguientes 24 horas.',
    price = 150,
    is_active = true
WHERE category_id = (SELECT id FROM public.categories WHERE name = 'Francés — Biblio Exos')
  AND name = 'Acompañamiento urgente de francés';

INSERT INTO public.services (category_id, name, description, price, is_active)
SELECT c.id, 'Acompañamiento urgente de francés',
       'Servicio prioritario de asesoría para las actividades correspondientes a una semana de francés, con atención dentro de las siguientes 24 horas.',
       150, true
FROM public.categories c
WHERE c.name = 'Francés — Biblio Exos'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.category_id = c.id AND s.name = 'Acompañamiento urgente de francés'
  );

COMMIT;