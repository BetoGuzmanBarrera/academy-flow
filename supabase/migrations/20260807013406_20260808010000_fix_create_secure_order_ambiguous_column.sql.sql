-- ============================================================
-- Fix: column reference "cred_entry" is ambiguous in create_secure_order
--
-- The PL/pgSQL variable `cred_entry` conflicted with the column alias
-- `cred_entry` used in jsonb_array_elements subqueries for duplicate
-- checks (SQLSTATE 42702). Rename the variable to `v_cred_entry` and
-- use `elem.value` as the column alias in the two duplicate checks.
--
-- No signature change. No logic change. No other functions touched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_secure_order(
  p_order_id uuid,
  p_user_id uuid,
  p_payment_method text,
  p_referral_code text DEFAULT NULL,
  p_encrypted_credentials jsonb DEFAULT '[]'::jsonb,
  p_billing jsonb DEFAULT NULL
)
RETURNS TABLE(order_id uuid, total_amount numeric, discount_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
  v_cred_entry jsonb;
  cred_service_id text;
  decoded_iv bytea;
  v_uuid_regex text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para crear una orden';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de orden no es válido';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'El identificador de orden ya existe';
  END IF;

  IF p_payment_method NOT IN ('card', 'paypal') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  SELECT count(*)
  INTO inactive_count
  FROM public.cart_items ci
  LEFT JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = p_user_id
    AND (s.id IS NULL OR s.is_active = false);

  IF inactive_count > 0 THEN
    RAISE EXCEPTION 'Tu carrito contiene un servicio que ya no está disponible. Elimínalo antes de continuar.';
  END IF;

  IF jsonb_typeof(p_encrypted_credentials) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'El formato de la información de acceso no es válido';
  END IF;

  FOR v_cred_entry IN SELECT value FROM jsonb_array_elements(p_encrypted_credentials) AS entry(value)
  LOOP
    IF jsonb_typeof(v_cred_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Cada entrada de credenciales debe ser un objeto';
    END IF;

    IF jsonb_typeof(v_cred_entry -> 'credential_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'credential_id debe ser texto';
    END IF;
    IF (v_cred_entry ->> 'credential_id') !~ v_uuid_regex THEN
      RAISE EXCEPTION 'El identificador de credencial no es un UUID válido';
    END IF;

    IF jsonb_typeof(v_cred_entry -> 'service_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'service_id debe ser texto';
    END IF;
    IF (v_cred_entry ->> 'service_id') !~ v_uuid_regex THEN
      RAISE EXCEPTION 'El identificador de servicio en las credenciales no es válido';
    END IF;

    IF jsonb_typeof(v_cred_entry -> 'encrypted_payload') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'encrypted_payload debe ser texto';
    END IF;
    IF v_cred_entry ->> 'encrypted_payload' = '' THEN
      RAISE EXCEPTION 'El payload cifrado no puede estar vacío';
    END IF;
    IF length(v_cred_entry ->> 'encrypted_payload') > 8192 THEN
      RAISE EXCEPTION 'El payload cifrado excede el tamaño máximo permitido';
    END IF;

    BEGIN
      PERFORM decode(v_cred_entry ->> 'encrypted_payload', 'base64');
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'El payload cifrado no es base64 válido';
    END;

    IF jsonb_typeof(v_cred_entry -> 'encryption_iv') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'encryption_iv debe ser texto';
    END IF;
    IF v_cred_entry ->> 'encryption_iv' = '' THEN
      RAISE EXCEPTION 'El IV no puede estar vacío';
    END IF;

    BEGIN
      decoded_iv := decode(v_cred_entry ->> 'encryption_iv', 'base64');
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'El IV no es base64 válido';
    END;

    IF octet_length(decoded_iv) <> 12 THEN
      RAISE EXCEPTION 'El IV debe tener exactamente 12 bytes';
    END IF;

    IF jsonb_typeof(v_cred_entry -> 'key_version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'key_version debe ser un número';
    END IF;
    IF (v_cred_entry ->> 'key_version')::int <> 1 THEN
      RAISE EXCEPTION 'La versión de clave no es válida';
    END IF;

    allowed_keys := ARRAY[
      'credential_id', 'service_id',
      'encrypted_payload', 'encryption_iv', 'key_version'
    ];
    SELECT array_agg(key) INTO actual_keys
    FROM jsonb_object_keys(v_cred_entry) AS key;
    SELECT array_agg(k) INTO bad_keys
    FROM unnest(actual_keys) AS k
    WHERE k <> ALL (allowed_keys);
    IF bad_keys IS NOT NULL THEN
      RAISE EXCEPTION 'Claves no permitidas en credencial cifrada: %',
        array_to_string(bad_keys, ', ');
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        elem.value ->> 'credential_id' AS cid,
        count(*) AS cnt
      FROM jsonb_array_elements(p_encrypted_credentials) AS elem(value)
      GROUP BY elem.value ->> 'credential_id'
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Hay identificadores de credencial duplicados';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        elem.value ->> 'service_id' AS sid,
        count(*) AS cnt
      FROM jsonb_array_elements(p_encrypted_credentials) AS elem(value)
      GROUP BY elem.value ->> 'service_id'
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Hay credenciales duplicadas para el mismo servicio';
  END IF;

  SELECT count(*), COALESCE(sum(s.price * ci.quantity), 0)
  INTO cart_count, subtotal
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = p_user_id
    AND s.is_active = true;

  IF cart_count = 0 OR subtotal <= 0 THEN
    RAISE EXCEPTION 'El carrito está vacío o contiene servicios no disponibles';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cart_items ci
    WHERE ci.user_id = p_user_id AND ci.quantity < 1
  ) THEN
    RAISE EXCEPTION 'La cantidad de cada servicio debe ser al menos 1';
  END IF;

  FOR rec IN
    SELECT ci.id, ci.details, ci.quantity, s.name AS service_name,
           c.name AS category_name
    FROM public.cart_items ci
    JOIN public.services s ON s.id = ci.service_id
    JOIN public.categories c ON c.id = s.category_id
    WHERE ci.user_id = p_user_id
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
    allowed_keys := ARRAY['additionalInstructions'];

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

    SELECT array_agg(key) INTO actual_keys
    FROM jsonb_object_keys(det) AS key;

    SELECT array_agg(k) INTO bad_keys
    FROM unnest(actual_keys) AS k
    WHERE k <> ALL (allowed_keys);

    IF bad_keys IS NOT NULL THEN
      RAISE EXCEPTION 'Las claves de personalización no son válidas para "%": %',
        rec.service_name, array_to_string(bad_keys, ', ');
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.cart_items ci
    JOIN public.services s ON s.id = ci.service_id
    WHERE ci.user_id = p_user_id
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
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tu carrito contiene una configuración duplicada de un servicio con cantidad fija. Elimina el duplicado antes de continuar.';
  END IF;

  SELECT count(DISTINCT service_id)
  INTO required_credentials
  FROM public.cart_items
  WHERE user_id = p_user_id;

  SELECT count(DISTINCT item ->> 'service_id')
  INTO provided_credentials
  FROM jsonb_array_elements(p_encrypted_credentials) AS item;

  IF provided_credentials <> required_credentials OR EXISTS (
    SELECT 1
    FROM public.cart_items ci
    WHERE ci.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_encrypted_credentials) AS entry(value)
        WHERE entry.value ->> 'service_id' = ci.service_id::text
      )
  ) THEN
    RAISE EXCEPTION 'Debes proporcionar la información de acceso para cada servicio';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_encrypted_credentials) AS entry(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.cart_items ci
      WHERE ci.user_id = p_user_id
        AND ci.service_id::text = entry.value ->> 'service_id'
    )
  ) THEN
    RAISE EXCEPTION 'Hay credenciales para un servicio que no está en el carrito';
  END IF;

  normalized_referral := NULLIF(upper(trim(COALESCE(p_referral_code, ''))), '');

  IF normalized_referral IS NOT NULL THEN
    SELECT id, user_id
    INTO referral_id, referral_owner
    FROM public.referral_codes
    WHERE code = normalized_referral;

    IF referral_id IS NULL THEN
      RAISE EXCEPTION 'Código de referido inválido';
    END IF;

    IF referral_owner = p_user_id THEN
      RAISE EXCEPTION 'No puedes usar tu propio código de referido';
    END IF;

    calculated_discount := round(subtotal * 0.30, 2);
  END IF;

  calculated_total := subtotal - calculated_discount;

  INSERT INTO public.orders (
    id, user_id, total_amount, status, payment_method,
    payment_id, referral_code_used, discount_amount
  ) VALUES (
    p_order_id, p_user_id, calculated_total, 'pending', p_payment_method,
    NULL, normalized_referral, calculated_discount
  );

  INSERT INTO public.order_items (order_id, service_id, quantity, unit_price, details)
  SELECT p_order_id, ci.service_id, ci.quantity, s.price, ci.details
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = p_user_id
    AND s.is_active = true;

  INSERT INTO public.order_credentials (
    id, order_id, service_id,
    encrypted_payload, encryption_iv, key_version,
    expires_at
  )
  SELECT
    (cred.value ->> 'credential_id')::uuid,
    p_order_id,
    (cred.value ->> 'service_id')::uuid,
    decode(cred.value ->> 'encrypted_payload', 'base64'),
    decode(cred.value ->> 'encryption_iv', 'base64'),
    COALESCE((cred.value ->> 'key_version')::int, 1),
    NULL
  FROM (
    SELECT DISTINCT ON (item.value ->> 'service_id')
           item.value
    FROM jsonb_array_elements(p_encrypted_credentials) AS item(value)
    ORDER BY item.value ->> 'service_id'
  ) AS cred(value);

  INSERT INTO public.credential_access_log (
    credential_id, order_id, accessed_by,
    action, success, reason_code, request_id
  )
  SELECT
    (cred.value ->> 'credential_id')::uuid,
    p_order_id,
    p_user_id,
    'encrypted',
    true,
    'order_created',
    NULL
  FROM (
    SELECT DISTINCT ON (item.value ->> 'service_id')
           item.value
    FROM jsonb_array_elements(p_encrypted_credentials) AS item(value)
    ORDER BY item.value ->> 'service_id'
  ) AS cred(value);

  IF p_billing IS NOT NULL THEN
    IF COALESCE(p_billing ->> 'rfc', '') = ''
       OR COALESCE(p_billing ->> 'legal_name', '') = ''
       OR COALESCE(p_billing ->> 'postal_code', '') !~ '^[0-9]{5}$'
       OR COALESCE(p_billing ->> 'tax_regime', '') = ''
       OR COALESCE(p_billing ->> 'cfdi_use', '') NOT IN ('G03', 'S01') THEN
      RAISE EXCEPTION 'Los datos fiscales están incompletos o no son válidos';
    END IF;

    INSERT INTO public.billing_information (
      order_id, rfc, legal_name, postal_code, tax_regime, cfdi_use
    ) VALUES (
      p_order_id,
      upper(p_billing ->> 'rfc'),
      upper(p_billing ->> 'legal_name'),
      p_billing ->> 'postal_code',
      p_billing ->> 'tax_regime',
      p_billing ->> 'cfdi_use'
    );
  END IF;

  IF referral_id IS NOT NULL THEN
    INSERT INTO public.referral_uses (
      referral_code_id, used_by_user_id, order_id, discount_amount
    ) VALUES (
      referral_id, p_user_id, p_order_id, calculated_discount
    );

    UPDATE public.referral_codes
    SET uses_count = uses_count + 1
    WHERE id = referral_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.referral_codes WHERE user_id = p_user_id
  ) THEN
    INSERT INTO public.referral_codes (user_id, code)
    VALUES (p_user_id, public.generate_referral_code(p_user_id))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  DELETE FROM public.cart_items WHERE user_id = p_user_id;

  RETURN QUERY SELECT p_order_id, calculated_total, calculated_discount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;
