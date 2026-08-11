/*
# Secure Order Workflow Base

## Purpose
Prepare the orders table for a Stripe-integrated future by adding
payment tracking columns, expanding the order status state machine,
blocking direct UPDATE bypasses, and creating an audit trail for
status transitions.

## 1. New Columns on public.orders
- `updated_at` (timestamptz, NOT NULL, DEFAULT now()) — maintained by trigger
- `completed_at` (timestamptz, NULL) — set when order reaches 'completed'
- `cancelled_at` (timestamptz, NULL) — set when order is cancelled
- `paid_at` (timestamptz, NULL) — reserved for future Stripe integration
- `refunded_at` (timestamptz, NULL) — reserved for future Stripe integration
- `payment_status` (text, NOT NULL, DEFAULT 'pending') — tracks payment lifecycle

## 2. Modified Constraints
- `orders_status_check` expanded to allow: pending, in_progress, completed, cancelled
- New `orders_payment_status_check` allows: pending, paid, failed, refunded

## 3. New Table: order_status_history
- Tracks every successful status transition
- Columns: id, order_id, from_status, to_status, changed_by, created_at
- RLS enabled: users read own orders, admins read all, no direct inserts

## 4. Trigger: orders_updated_at
- Auto-maintains updated_at on every UPDATE

## 5. Security Changes
- DROP existing "Admins can update orders" UPDATE policy
- CREATE new UPDATE policies that block ALL direct updates from anon/authenticated
- SECURITY DEFINER functions bypass RLS, so only they can update orders

## 6. Important Notes
- No existing data is modified or deleted
- Existing orders keep their current status (pending/completed/cancelled)
- New payment_status defaults to 'pending' for all existing orders
*/

-- ============================================================
-- 1. Add new columns to orders
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

-- ============================================================
-- 2. Replace status CHECK constraint and add payment_status CHECK
-- ============================================================

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]));

-- ============================================================
-- 3. Create order_status_history table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own order history" ON public.order_status_history;
CREATE POLICY "Users can read own order history"
  ON public.order_status_history FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins can read all order history" ON public.order_status_history;
CREATE POLICY "Admins can read all order history"
  ON public.order_status_history FOR SELECT
  TO authenticated
  USING (is_admin());

-- ============================================================
-- 4. Trigger to maintain updated_at on orders
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orders_updated_at();

-- ============================================================
-- 5. Block direct UPDATE on orders from browser/client
-- ============================================================
-- SECURITY DEFINER functions bypass RLS entirely, so our RPC
-- functions can still UPDATE orders. Browser clients cannot.

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "No direct updates to orders" ON public.orders;
DROP POLICY IF EXISTS "No anon updates to orders" ON public.orders;

CREATE POLICY "No direct updates to orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No anon updates to orders"
  ON public.orders FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 6. Grants on order_status_history
-- ============================================================
GRANT SELECT ON public.order_status_history TO authenticated;
-- No INSERT/UPDATE/DELETE grants to authenticated or anon.