/*
  # Add Billing Information for CFDI 4.0

  1. New Tables
    - `billing_information`
      - `id` (uuid, primary key)
      - `order_id` (uuid, references orders)
      - `rfc` (text, RFC fiscal identifier)
      - `legal_name` (text, nombre o razón social)
      - `postal_code` (text, código postal fiscal)
      - `tax_regime` (text, régimen fiscal)
      - `cfdi_use` (text, uso del CFDI - G03 or S01)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `billing_information` table
    - Add policies for authenticated users to manage their own billing data
*/

CREATE TABLE IF NOT EXISTS billing_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  rfc text NOT NULL,
  legal_name text NOT NULL,
  postal_code text NOT NULL,
  tax_regime text NOT NULL,
  cfdi_use text NOT NULL CHECK (cfdi_use IN ('G03', 'S01')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE billing_information ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own billing information"
  ON billing_information
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = billing_information.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own billing information"
  ON billing_information
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = billing_information.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE INDEX idx_billing_information_order_id ON billing_information(order_id);