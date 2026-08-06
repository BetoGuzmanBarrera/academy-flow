/*
  Academy Flow: perfiles, roles administrativos y checkout transaccional seguro.

  Objetivos:
  - Crear/normalizar public.profiles y generar perfiles automáticamente al registrarse.
  - Añadir el rol user/admin y políticas RLS para el panel administrativo.
  - Evitar que el navegador inserte o complete órdenes directamente.
  - Calcular precios y descuentos dentro de PostgreSQL.
  - Registrar la orden, sus artículos, credenciales, referido y facturación en una sola transacción.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  birth_date date,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;
END
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    birth_date
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data ->> 'birth_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN (NEW.raw_user_meta_data ->> 'birth_date')::date
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, first_name, last_name)
SELECT id, '', ''
FROM auth.users
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Los usuarios normales pueden modificar sus datos, pero no su rol.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, birth_date, updated_at) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity log" ON public.admin_activity_log;
CREATE POLICY "Admins can view activity log"
  ON public.admin_activity_log FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can create activity log" ON public.admin_activity_log;
CREATE POLICY "Admins can create activity log"
  ON public.admin_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND admin_id = (SELECT auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at
  ON public.admin_activity_log(created_at DESC);

-- Políticas administrativas. Las políticas existentes de lectura del usuario se conservan.
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services"
  ON public.services FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;
CREATE POLICY "Admins can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can view order items" ON public.order_items;
CREATE POLICY "Admins can view order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage order credentials" ON public.order_credentials;
CREATE POLICY "Admins can manage order credentials"
  ON public.order_credentials FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage support messages" ON public.support_messages;
CREATE POLICY "Admins can manage support messages"
  ON public.support_messages FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage referral codes" ON public.referral_codes;
CREATE POLICY "Admins can manage referral codes"
  ON public.referral_codes FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage referral uses" ON public.referral_uses;
CREATE POLICY "Admins can manage referral uses"
  ON public.referral_uses FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins can manage billing information" ON public.billing_information;
CREATE POLICY "Admins can manage billing information"
  ON public.billing_information FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- El cliente ya no puede insertar ni cambiar órdenes directamente.
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert order items for own orders" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert credentials for own orders" ON public.order_credentials;
DROP POLICY IF EXISTS "Users can insert referral uses" ON public.referral_uses;
DROP POLICY IF EXISTS "Users can insert own billing information" ON public.billing_information;
DROP POLICY IF EXISTS "Users can insert own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Anyone can view referral codes for validation" ON public.referral_codes;

CREATE OR REPLACE FUNCTION public.validate_referral_code(code_param text)
RETURNS TABLE (valid boolean, self_use boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.referral_codes
      WHERE code = upper(trim(code_param))
    ) AS valid,
    EXISTS (
      SELECT 1
      FROM public.referral_codes
      WHERE code = upper(trim(code_param))
        AND user_id = (SELECT auth.uid())
    ) AS self_use;
$$;

REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_codes_user_id
  ON public.referral_codes(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_uses_order_id
  ON public.referral_uses(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_information_order_id
  ON public.billing_information(order_id);

CREATE OR REPLACE FUNCTION public.generate_referral_code(user_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_code text;
BEGIN
  LOOP
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text || user_id_param::text), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.referral_codes WHERE code = new_code
    );
  END LOOP;

  RETURN new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.generate_referral_code(uuid) FROM authenticated;

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
  credential_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para crear una orden';
  END IF;

  IF payment_method_param NOT IN ('card', 'paypal') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  SELECT count(*), COALESCE(sum(s.price * ci.quantity), 0)
    INTO cart_count, subtotal
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = current_user_id
    AND s.is_active = true;

  IF cart_count = 0 OR subtotal <= 0 THEN
    RAISE EXCEPTION 'El carrito está vacío o contiene servicios no disponibles';
  END IF;

  SELECT count(DISTINCT item ->> 'service_id')
    INTO credential_count
  FROM jsonb_array_elements(COALESCE(credentials_param, '[]'::jsonb)) AS item;

  IF credential_count <> cart_count OR EXISTS (
    SELECT 1
    FROM public.cart_items ci
    WHERE ci.user_id = current_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(credentials_param, '[]'::jsonb)) AS entry(value)
        WHERE entry.value ->> 'service_id' = ci.service_id::text
      )
  ) THEN
    RAISE EXCEPTION 'Debes proporcionar la información de acceso para cada servicio';
  END IF;

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

  INSERT INTO public.order_items (order_id, service_id, quantity, unit_price)
  SELECT created_order_id, ci.service_id, ci.quantity, s.price
  FROM public.cart_items ci
  JOIN public.services s ON s.id = ci.service_id
  WHERE ci.user_id = current_user_id
    AND s.is_active = true;

  INSERT INTO public.order_credentials (
    order_id,
    service_id,
    platform_email,
    platform_password,
    aleks_account,
    additional_info
  )
  SELECT
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

  IF NOT EXISTS (
    SELECT 1 FROM public.referral_codes WHERE user_id = current_user_id
  ) THEN
    INSERT INTO public.referral_codes (user_id, code)
    VALUES (current_user_id, public.generate_referral_code(current_user_id))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  DELETE FROM public.cart_items WHERE user_id = current_user_id;

  RETURN QUERY SELECT created_order_id, calculated_total, calculated_discount;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_pending_order(text, text, jsonb, jsonb) TO authenticated;

COMMIT;
