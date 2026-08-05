/*
  # Add Support Messages and Order Credentials Tables

  ## Overview
  Creates tables for support chat functionality and order credentials for platform accounts.

  ## New Tables
  
  ### `support_messages`
  - `id` (uuid, primary key) - Unique identifier for each message
  - `user_id` (uuid, foreign key, nullable) - References auth.users (nullable for guest messages)
  - `user_email` (text) - Email of the user sending the message
  - `user_name` (text) - Name of the user sending the message
  - `message` (text) - The support message content
  - `status` (text) - Message status (pending, in_progress, resolved)
  - `admin_response` (text, nullable) - Response from admin
  - `created_at` (timestamptz) - Message creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ### `order_credentials`
  - `id` (uuid, primary key) - Unique identifier
  - `order_id` (uuid, foreign key) - References orders table
  - `service_id` (uuid, foreign key) - References services table
  - `platform_email` (text, nullable) - Email/username for the platform
  - `platform_password` (text, nullable) - Password for the platform
  - `aleks_account` (text, nullable) - ALEKS account username
  - `additional_info` (text, nullable) - Any additional information
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on both tables
  - Users can create their own support messages
  - Users can view their own support messages
  - Users can create credentials for their own orders
  - Users can view credentials for their own orders
*/

-- Create support_messages table
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  user_name text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  admin_response text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create order_credentials table
CREATE TABLE IF NOT EXISTS order_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE RESTRICT NOT NULL,
  platform_email text,
  platform_password text,
  aleks_account text,
  additional_info text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(order_id, service_id)
);

-- Enable Row Level Security
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_credentials ENABLE ROW LEVEL SECURITY;

-- Support messages policies
CREATE POLICY "Anyone can create support messages"
  ON support_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view own support messages"
  ON support_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view messages without user_id if they match email"
  ON support_messages FOR SELECT
  TO authenticated
  USING (user_id IS NULL AND user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Order credentials policies
CREATE POLICY "Users can insert credentials for own orders"
  ON order_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_credentials.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view credentials for own orders"
  ON order_credentials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_credentials.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update credentials for own orders"
  ON order_credentials FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_credentials.order_id
      AND orders.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_credentials.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status ON support_messages(status);
CREATE INDEX IF NOT EXISTS idx_order_credentials_order_id ON order_credentials(order_id);

-- Remove ALEKS and Blackboard fields from profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'aleks_account'
  ) THEN
    ALTER TABLE profiles DROP COLUMN aleks_account;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'blackboard_account'
  ) THEN
    ALTER TABLE profiles DROP COLUMN blackboard_account;
  END IF;
END $$;