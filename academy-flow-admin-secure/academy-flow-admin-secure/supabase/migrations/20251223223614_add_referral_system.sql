/*
  # Add Referral System

  ## Overview
  Creates tables for referral code system with 30% discount functionality.

  ## New Tables
  
  ### `referral_codes`
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key) - User who owns this referral code
  - `code` (text, unique) - Unique referral code
  - `uses_count` (integer) - Number of times code has been used
  - `created_at` (timestamptz) - Code creation timestamp
  
  ### `referral_uses`
  - `id` (uuid, primary key) - Unique identifier
  - `referral_code_id` (uuid, foreign key) - References referral_codes
  - `used_by_user_id` (uuid, foreign key) - User who used the code
  - `order_id` (uuid, foreign key) - Order where code was used
  - `discount_amount` (decimal) - Discount amount applied
  - `created_at` (timestamptz) - When code was used

  ## Changes to Existing Tables
  - Add `referral_code_used` (text, nullable) to orders table
  - Add `discount_amount` (decimal) to orders table

  ## Security
  - Enable RLS on all tables
  - Users can view their own referral codes
  - Users can view referral uses from their codes
  - Anyone can validate a referral code (for checkout)
*/

-- Add columns to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'referral_code_used'
  ) THEN
    ALTER TABLE orders ADD COLUMN referral_code_used text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN discount_amount decimal(10,2) DEFAULT 0;
  END IF;
END $$;

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code text UNIQUE NOT NULL,
  uses_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create referral_uses table
CREATE TABLE IF NOT EXISTS referral_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid REFERENCES referral_codes(id) ON DELETE CASCADE NOT NULL,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  discount_amount decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;

-- Referral codes policies
CREATE POLICY "Users can view own referral codes"
  ON referral_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own referral codes"
  ON referral_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view referral codes for validation"
  ON referral_codes FOR SELECT
  USING (true);

-- Referral uses policies
CREATE POLICY "Users can view uses of their referral codes"
  ON referral_uses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM referral_codes
      WHERE referral_codes.id = referral_uses.referral_code_id
      AND referral_codes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own referral uses"
  ON referral_uses FOR SELECT
  TO authenticated
  USING (auth.uid() = used_by_user_id);

CREATE POLICY "Users can insert referral uses"
  ON referral_uses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = used_by_user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_uses_code_id ON referral_uses(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_user_id ON referral_uses(used_by_user_id);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(user_id_param uuid)
RETURNS text AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := UPPER(substring(md5(random()::text || user_id_param::text) from 1 for 8));
    
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = new_code) INTO code_exists;
    
    IF NOT code_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;