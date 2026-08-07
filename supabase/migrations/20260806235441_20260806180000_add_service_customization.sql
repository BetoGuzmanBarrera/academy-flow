/*
# Add service customization (details) to cart_items and order_items

1. Schema changes
- cart_items: add `details jsonb NOT NULL DEFAULT '{}'::jsonb`
- order_items: add `details jsonb NOT NULL DEFAULT '{}'::jsonb`
- Both get a CHECK constraint ensuring `details` is always a JSON object.

2. Constraint changes
- Drop UNIQUE (user_id, service_id) from cart_items so the same service
  can appear multiple times with different personalizations.
- Add a normal index idx_cart_items_user_service on (user_id, service_id).

3. RPC changes
- create_pending_order now:
  - Rejects inactive/missing services before calculating anything.
  - Validates credentials_param is an array of objects with UUID service_id.
  - Validates details per service (allowed keys, types, ranges, required fields).
  - Rejects duplicate fixed-quantity configurations.
  - Computes required_credentials as COUNT(DISTINCT service_id).
  - Inserts one order_credentials row per distinct service_id.
  - Copies details from cart_items into order_items.

4. Security
- No changes to RLS, Stripe, roles, auth, categories, or prices.
*/

-- ============================================================
-- 1. Eliminar restricción UNIQUE (user_id, service_id) de cart_items
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_user_id_service_id_key'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      DROP CONSTRAINT cart_items_user_id_service_id_key;
  END IF;
END
$$;

-- ============================================================
-- 2. Añadir columna details a cart_items
-- ============================================================
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 3. Añadir columna details a order_items
-- ============================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 4. CHECK: details debe ser un objeto JSON (cart_items)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cart_items_details_is_object'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_details_is_object
      CHECK (jsonb_typeof(details) = 'object');
  END IF;
END
$$;

-- ============================================================
-- 5. CHECK: details debe ser un objeto JSON (order_items)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_items_details_is_object'
      AND conrelid = 'public.order_items'::regclass
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_details_is_object
      CHECK (jsonb_typeof(details) = 'object');
  END IF;
END
$$;

-- ============================================================
-- 6. Índice normal (user_id, service_id) en cart_items
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_service
  ON public.cart_items (user_id, service_id);

-- ============================================================
-- 7. RPC create_pending_order corregida
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_pending_order(
  payment_method_param text,
  referral_code_param text DEFAULT NULL,
  credentials_param jsonb DEFAULT '[]'::jsonb,
  billing_param jsonb DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  total_amount numeric,
  discount_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  created_order_id uuid;
  subtotal numeric(10,2);
  calculated_discount numeric(10,2) := 0;
  calculated_total numeric(10,2);
  normalized_referral text;
  referral_id uuid;
  referral_owner uuid;
  cart_count integer;
  required_credentials integer;
  provided_credentials integer;
  inactive_count integer;
  rec record;
  det jsonb;
  det_subject text;
  det_partial text;
  det_module text;
  det_level text;
  det_unit text;
  det_exam text;
  det_week text;
  det_instructions text;
  det_quantity integer;
  allowed_keys text[];
  actual_keys text[];
  bad_keys text[];
  cred_entry jsonb;
  cred_service_id text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para crear una orden';
  END IF;

  IF payment_method_param NOT IN ('card', 'paypal') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  -- ============================================================
  -- Verificar servicios inactivos o inexistentes ANTES de calcular
  -- ============================================================
  SELECT count(*)
    INTO inactive_count
  FROM public.cart_items ci
  LEFT JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = current_user_id
    AND (s.id IS NULL OR s.is_active = false);

  IF inactive_count > 0 THEN
    RAISE EXCEPTION 'Tu carrito contiene un servicio que ya no está disponible. Elimínalo antes de continuar.';
  END IF;

  -- ============================================================
  -- Validar tipo de credentials_param
  -- ============================================================
  IF jsonb_typeof(credentials_param) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'El formato de la información de acceso no es válido';
  END IF;

  -- Validar cada entrada de credenciales
  FOR cred_entry IN SELECT value FROM jsonb_array_elements(credentials_param) AS entry(value)
  LOOP
    IF jsonb_typeof(cred_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Cada entrada de credenciales debe ser un objeto';
    END IF;

    cred_service_id := cred_entry ->> 'service_id';
    IF cred_service_id IS NULL OR cred_service_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'El identificador de servicio en las credenciales no es válido';
    END IF;
  END LOOP;

  -- ============================================================
  -- Calcular subtotal desde services (precio confiable)
  -- ============================================================
  SELECT count(*), COALESCE(sum(s.price * ci.quantity), 0)
    INTO cart_count, subtotal
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = current_user_id
    AND s.is_active = true;

  IF cart_count = 0 OR subtotal <= 0 THEN
    RAISE EXCEPTION 'El carrito está vacío o contiene servicios no disponibles';
  END IF;

  -- Validar quantity >= 1
  IF EXISTS (
    SELECT 1 FROM public.cart_items ci
    WHERE ci.user_id = current_user_id AND ci.quantity < 1
  ) THEN
    RAISE EXCEPTION 'La cantidad de cada servicio debe ser al menos 1';
  END IF;

  -- ============================================================
  -- Validar details de cada cart_item
  -- ============================================================
  FOR rec IN
    SELECT ci.id, ci.details, ci.quantity, s.name AS service_name,
           c.name AS category_name
    FROM public.cart_items ci
    JOIN public.services s ON s.id = ci.service_id
    JOIN public.categories c ON c.id = s.category_id
    WHERE ci.user_id = current_user_id
      AND s.is_active = true
  LOOP
    det := COALESCE(rec.details, '{}'::jsonb);

    IF jsonb_typeof(det) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Los datos de personalización de "%" deben ser un objeto JSON', rec.service_name;
    END IF;

    det_instructions := det ->> 'additionalInstructions';
    IF det_instructions IS NOT NULL AND length(det_instructions) > 500 THEN
      RAISE EXCEPTION 'Las instrucciones adicionales de "%" no pueden exceder 500 caracteres', rec.service_name;
    END IF;

    det_quantity := rec.quantity;

    -- Determinar claves permitidas según servicio
    allowed_keys := ARRAY['additionalInstructions'];

    -- ALEKS Universidad
    IF rec.category_name = 'ALEKS Universidad' THEN
      det_subject := det ->> 'subject';

      IF rec.service_name = 'Preparación para examen parcial' THEN
        allowed_keys := ARRAY['subject', 'partial', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Preparación para examen parcial"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Preparación para examen parcial"';
        END IF;

        det_partial := det ->> 'partial';
        IF det_partial IS NULL OR btrim(det_partial) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar un parcial para "Preparación para examen parcial"';
        END IF;
        IF btrim(det_partial) NOT IN ('1', '2', '3') THEN
          RAISE EXCEPTION 'El parcial debe ser 1, 2 o 3';
        END IF;
        IF det_quantity <> 1 THEN
          RAISE EXCEPTION 'La cantidad para "Preparación para examen parcial" debe ser 1';
        END IF;

      ELSIF rec.service_name = 'Preparación para examen final' THEN
        allowed_keys := ARRAY['subject', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Preparación para examen final"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Preparación para examen final"';
        END IF;
        IF det_quantity <> 1 THEN
          RAISE EXCEPTION 'La cantidad para "Preparación para examen final" debe ser 1';
        END IF;

      ELSIF rec.service_name = 'Acompañamiento por tema de parcial' THEN
        allowed_keys := ARRAY['subject', 'partial', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Acompañamiento por tema de parcial"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Acompañamiento por tema de parcial"';
        END IF;

        det_partial := det ->> 'partial';
        IF det_partial IS NOT NULL AND btrim(det_partial) <> ''
           AND btrim(det_partial) NOT IN ('1', '2', '3') THEN
          RAISE EXCEPTION 'El parcial debe ser 1, 2 o 3 (o dejarlo vacío)';
        END IF;
        IF det_quantity < 1 OR det_quantity > 196 THEN
          RAISE EXCEPTION 'La cantidad de temas debe estar entre 1 y 196';
        END IF;

      ELSIF rec.service_name = 'Preparación para Verificación Inicial de Conocimientos' THEN
        allowed_keys := ARRAY['subject', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Preparación para Verificación Inicial de Conocimientos"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Preparación para Verificación Inicial de Conocimientos"';
        END IF;
        IF det_quantity <> 1 THEN
          RAISE EXCEPTION 'La cantidad para "Preparación para Verificación Inicial de Conocimientos" debe ser 1';
        END IF;

      ELSIF rec.service_name = 'Asesoría para tareas colaborativas' THEN
        allowed_keys := ARRAY['subject', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Asesoría para tareas colaborativas"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Asesoría para tareas colaborativas"';
        END IF;
        IF det_quantity < 1 OR det_quantity > 40 THEN
          RAISE EXCEPTION 'La cantidad de actividades debe estar entre 1 y 40';
        END IF;

      ELSIF rec.service_name = 'Asesoría para tareas individuales' THEN
        allowed_keys := ARRAY['subject', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Asesoría para tareas individuales"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Asesoría para tareas individuales"';
        END IF;
        IF det_quantity < 1 OR det_quantity > 40 THEN
          RAISE EXCEPTION 'La cantidad de actividades debe estar entre 1 y 40';
        END IF;

      ELSIF rec.service_name = 'Preparación para Verificación de Conocimientos' THEN
        allowed_keys := ARRAY['subject', 'moduleOrPartial', 'additionalInstructions'];

        IF det_subject IS NULL OR btrim(det_subject) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar una materia para "Preparación para Verificación de Conocimientos"';
        END IF;
        IF btrim(det_subject) NOT IN ('Álgebra', 'Matemáticas Aplicadas', 'Cálculo') THEN
          RAISE EXCEPTION 'La materia seleccionada no es válida para "Preparación para Verificación de Conocimientos"';
        END IF;

        det_module := det ->> 'moduleOrPartial';
        IF det_module IS NOT NULL AND length(det_module) > 100 THEN
          RAISE EXCEPTION 'El módulo o parcial no puede exceder 100 caracteres';
        END IF;
        IF det_quantity <> 1 THEN
          RAISE EXCEPTION 'La cantidad para "Preparación para Verificación de Conocimientos" debe ser 1';
        END IF;
      END IF;

    -- CAMBRIDGE ONE
    ELSIF rec.category_name = 'CAMBRIDGE ONE' THEN
      det_level := det ->> 'level';

      IF rec.service_name = 'Acompañamiento para Unidad Abierta' THEN
        allowed_keys := ARRAY['level', 'unit', 'additionalInstructions'];

        IF det_level IS NULL OR btrim(det_level) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar un nivel para "Acompañamiento para Unidad Abierta"';
        END IF;
        IF length(det_level) > 100 THEN
          RAISE EXCEPTION 'El nivel no puede exceder 100 caracteres';
        END IF;

        det_unit := det ->> 'unit';
        IF det_unit IS NULL OR btrim(det_unit) = '' THEN
          RAISE EXCEPTION 'Debes indicar el número o nombre de la unidad para "Acompañamiento para Unidad Abierta"';
        END IF;
        IF length(det_unit) > 100 THEN
          RAISE EXCEPTION 'La unidad no puede exceder 100 caracteres';
        END IF;
        IF det_quantity < 1 THEN
          RAISE EXCEPTION 'La cantidad de unidades debe ser al menos 1';
        END IF;

      ELSIF rec.service_name = 'Guía de preparación para examen' THEN
        allowed_keys := ARRAY['level', 'exam', 'additionalInstructions'];

        IF det_level IS NULL OR btrim(det_level) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar un nivel para "Guía de preparación para examen"';
        END IF;
        IF length(det_level) > 100 THEN
          RAISE EXCEPTION 'El nivel no puede exceder 100 caracteres';
        END IF;

        det_exam := det ->> 'exam';
        IF det_exam IS NOT NULL AND length(det_exam) > 100 THEN
          RAISE EXCEPTION 'El nombre del examen no puede exceder 100 caracteres';
        END IF;
        IF det_quantity <> 1 THEN
          RAISE EXCEPTION 'La cantidad para "Guía de preparación para examen" debe ser 1';
        END IF;

      ELSIF rec.service_name = 'Acompañamiento urgente de unidad' THEN
        allowed_keys := ARRAY['level', 'unit', 'additionalInstructions'];

        IF det_level IS NULL OR btrim(det_level) = '' THEN
          RAISE EXCEPTION 'Debes seleccionar un nivel para "Acompañamiento urgente de unidad"';
        END IF;
        IF length(det_level) > 100 THEN
          RAISE EXCEPTION 'El nivel no puede exceder 100 caracteres';
        END IF;

        det_unit := det ->> 'unit';
        IF det_unit IS NULL OR btrim(det_unit) = '' THEN
          RAISE EXCEPTION 'Debes indicar el número o nombre de la unidad para "Acompañamiento urgente de unidad"';
        END IF;
        IF length(det_unit) > 100 THEN
          RAISE EXCEPTION 'La unidad no puede exceder 100 caracteres';
        END IF;
        IF det_quantity < 1 THEN
          RAISE EXCEPTION 'La cantidad de unidades debe ser al menos 1';
        END IF;
      END IF;

    -- Francés — Biblio Exos
    ELSIF rec.category_name = 'Francés — Biblio Exos' THEN
      allowed_keys := ARRAY['week', 'additionalInstructions'];

      det_week := det ->> 'week';
      IF det_week IS NULL OR btrim(det_week) = '' THEN
        RAISE EXCEPTION 'Debes indicar el número de semana para "%"', rec.service_name;
      END IF;
      IF btrim(det_week) !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'El número de semana debe ser un número entero';
      END IF;
      IF (btrim(det_week))::int < 1 OR (btrim(det_week))::int > 13 THEN
        RAISE EXCEPTION 'El número de semana debe estar entre 1 y 13';
      END IF;
      IF det_quantity <> 1 THEN
        RAISE EXCEPTION 'La cantidad para "%" debe ser 1', rec.service_name;
      END IF;
    END IF;

    -- ============================================================
    -- Validar tipos JSON de campos
    -- ============================================================
    IF det ? 'subject' AND jsonb_typeof(det -> 'subject') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'La materia debe ser texto';
    END IF;
    IF det ? 'partial' AND jsonb_typeof(det -> 'partial') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'El parcial debe ser texto';
    END IF;
    IF det ? 'moduleOrPartial' AND jsonb_typeof(det -> 'moduleOrPartial') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'El módulo o parcial debe ser texto';
    END IF;
    IF det ? 'level' AND jsonb_typeof(det -> 'level') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'El nivel debe ser texto';
    END IF;
    IF det ? 'unit' AND jsonb_typeof(det -> 'unit') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'La unidad debe ser texto';
    END IF;
    IF det ? 'exam' AND jsonb_typeof(det -> 'exam') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'El examen debe ser texto';
    END IF;
    IF det ? 'additionalInstructions'
       AND jsonb_typeof(det -> 'additionalInstructions') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Las instrucciones adicionales deben ser texto';
    END IF;
    IF det ? 'week' THEN
      IF jsonb_typeof(det -> 'week') NOT IN ('string', 'number') THEN
        RAISE EXCEPTION 'El número de semana debe ser un número o texto';
      END IF;
    END IF;

    -- ============================================================
    -- Validar claves permitidas (rechazar desconocidas)
    -- ============================================================
    SELECT array_agg(key) INTO actual_keys
    FROM jsonb_object_keys(det) AS key;

    SELECT array_agg(k) INTO bad_keys
    FROM unnest(actual_keys) AS k
    WHERE k <> ALL (allowed_keys);

    IF bad_keys IS NOT NULL THEN
      RAISE EXCEPTION 'Las claves de personalización no son válidas para "%": %', rec.service_name, array_to_string(bad_keys, ', ');
    END IF;
  END LOOP;

  -- ============================================================
  -- Rechazar configuraciones duplicadas de servicios con cantidad fija
  -- ============================================================
  IF EXISTS (
    SELECT 1
    FROM public.cart_items ci
    JOIN public.services s ON s.id = ci.service_id
    WHERE ci.user_id = current_user_id
      AND s.name IN (
        'Preparación para examen parcial',
        'Preparación para examen final',
        'Preparación para Verificación Inicial de Conocimientos',
        'Preparación para Verificación de Conocimientos',
        'Guía de preparación para examen',
        'Acompañamiento semanal de francés',
        'Acompañamiento urgente de francés'
      )
    GROUP BY ci.service_id, ci.details
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tu carrito contiene una configuración duplicada de un servicio con cantidad fija. Elimina el duplicado antes de continuar.';
  END IF;

  -- ============================================================
  -- Validar credenciales (una por service_id distinto)
  -- ============================================================
  SELECT count(DISTINCT service_id)
    INTO required_credentials
  FROM public.cart_items
  WHERE user_id = current_user_id;

  SELECT count(DISTINCT item ->> 'service_id')
    INTO provided_credentials
  FROM jsonb_array_elements(credentials_param) AS item;

  IF provided_credentials <> required_credentials OR EXISTS (
    SELECT 1
    FROM public.cart_items ci
    WHERE ci.user_id = current_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(credentials_param) AS entry(value)
        WHERE entry.value ->> 'service_id' = ci.service_id::text
      )
  ) THEN
    RAISE EXCEPTION 'Debes proporcionar la información de acceso para cada servicio';
  END IF;

  -- ============================================================
  -- Referido
  -- ============================================================
  normalized_referral := NULLIF(upper(trim(COALESCE(referral_code_param, ''))), '');

  IF normalized_referral IS NOT NULL THEN
    SELECT id, user_id
      INTO referral_id, referral_owner
    FROM public.referral_codes
    WHERE code = normalized_referral;

    IF referral_id IS NULL THEN
      RAISE EXCEPTION 'Código de referido inválido';
    END IF;

    IF referral_owner = current_user_id THEN
      RAISE EXCEPTION 'No puedes usar tu propio código de referido';
    END IF;

    calculated_discount := round(subtotal * 0.30, 2);
  END IF;

  calculated_total := subtotal - calculated_discount;

  -- Crear orden
  INSERT INTO public.orders (
    user_id,
    total_amount,
    status,
    payment_method,
    payment_id,
    referral_code_used,
    discount_amount
  )
  VALUES (
    current_user_id,
    calculated_total,
    'pending',
    payment_method_param,
    NULL,
    normalized_referral,
    calculated_discount
  )
  RETURNING id INTO created_order_id;

  -- Insertar order_items copiando details desde cart_items
  INSERT INTO public.order_items (order_id, service_id, quantity, unit_price, details)
  SELECT created_order_id, ci.service_id, ci.quantity, s.price, ci.details
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = current_user_id
    AND s.is_active = true;

  -- Insertar credenciales (una fila por service_id distinto)
  INSERT INTO public.order_credentials (
    order_id,
    service_id,
    platform_email,
    platform_password,
    aleks_account,
    additional_info
  )
  SELECT DISTINCT ON (ci.service_id)
    created_order_id,
    ci.service_id,
    NULLIF(credential.value ->> 'platformEmail', ''),
    NULLIF(credential.value ->> 'platformPassword', ''),
    NULLIF(credential.value ->> 'aleksAccount', ''),
    NULLIF(credential.value ->> 'additionalInfo', '')
  FROM public.cart_items ci
  JOIN LATERAL (
    SELECT value
    FROM jsonb_array_elements(credentials_param) AS entry(value)
    WHERE entry.value ->> 'service_id' = ci.service_id::text
    LIMIT 1
  ) AS credential ON true
  WHERE ci.user_id = current_user_id;

  -- Facturación
  IF billing_param IS NOT NULL THEN
    IF COALESCE(billing_param ->> 'rfc', '') = ''
      OR COALESCE(billing_param ->> 'legal_name', '') = ''
      OR COALESCE(billing_param ->> 'postal_code', '') !~ '^[0-9]{5}$'
      OR COALESCE(billing_param ->> 'tax_regime', '') = ''
      OR COALESCE(billing_param ->> 'cfdi_use', '') NOT IN ('G03', 'S01') THEN
      RAISE EXCEPTION 'Los datos fiscales están incompletos o no son válidos';
    END IF;

    INSERT INTO public.billing_information (
      order_id,
      rfc,
      legal_name,
      postal_code,
      tax_regime,
      cfdi_use
    )
    VALUES (
      created_order_id,
      upper(billing_param ->> 'rfc'),
      upper(billing_param ->> 'legal_name'),
      billing_param ->> 'postal_code',
      billing_param ->> 'tax_regime',
      billing_param ->> 'cfdi_use'
    );
  END IF;

  -- Referido
  IF referral_id IS NOT NULL THEN
    INSERT INTO public.referral_uses (
      referral_code_id,
      used_by_user_id,
      order_id,
      discount_amount
    )
    VALUES (
      referral_id,
      current_user_id,
      created_order_id,
      calculated_discount
    );

    UPDATE public.referral_codes
    SET uses_count = uses_count + 1
    WHERE id = referral_id;
  END IF;

  -- Generar código de referido si no existe
  IF NOT EXISTS (
    SELECT 1 FROM public.referral_codes WHERE user_id = current_user_id
  ) THEN
    INSERT INTO public.referral_codes (user_id, code)
    VALUES (current_user_id, public.generate_referral_code(current_user_id))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Limpiar carrito
  DELETE FROM public.cart_items WHERE user_id = current_user_id;

  RETURN QUERY SELECT created_order_id, calculated_total, calculated_discount;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) TO authenticated;
