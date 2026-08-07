export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string | null;
          price: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description?: string | null;
          price: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          user_id: string;
          service_id: string;
          quantity: number;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          service_id: string;
          quantity?: number;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          service_id?: string;
          quantity?: number;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          total_amount: number;
          status: 'pending' | 'completed' | 'cancelled';
          payment_method: 'card' | 'paypal';
          payment_id: string | null;
          referral_code_used: string | null;
          discount_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          total_amount: number;
          status?: 'pending' | 'completed' | 'cancelled';
          payment_method: 'card' | 'paypal';
          payment_id?: string | null;
          referral_code_used?: string | null;
          discount_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          total_amount?: number;
          status?: 'pending' | 'completed' | 'cancelled';
          payment_method?: 'card' | 'paypal';
          payment_id?: string | null;
          referral_code_used?: string | null;
          discount_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          service_id: string;
          quantity: number;
          unit_price: number;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          service_id: string;
          quantity: number;
          unit_price: number;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          service_id?: string;
          quantity?: number;
          unit_price?: number;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          birth_date: string | null;
          role: 'user' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string;
          last_name?: string;
          birth_date?: string | null;
          role?: 'user' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          birth_date?: string | null;
          role?: 'user' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          user_id: string | null;
          user_email: string;
          user_name: string;
          message: string;
          status: 'pending' | 'in_progress' | 'resolved';
          admin_response: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          user_email: string;
          user_name: string;
          message: string;
          status?: 'pending' | 'in_progress' | 'resolved';
          admin_response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          user_email?: string;
          user_name?: string;
          message?: string;
          status?: 'pending' | 'in_progress' | 'resolved';
          admin_response?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_credentials: {
        Row: {
          id: string;
          order_id: string;
          service_id: string;
          platform_email: string | null;
          platform_password: string | null;
          aleks_account: string | null;
          additional_info: string | null;
          encrypted_payload: string | null;
          encryption_iv: string | null;
          key_version: number;
          expires_at: string | null;
          updated_at: string;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          service_id: string;
          platform_email?: string | null;
          platform_password?: string | null;
          aleks_account?: string | null;
          additional_info?: string | null;
          encrypted_payload?: string | null;
          encryption_iv?: string | null;
          key_version?: number;
          expires_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          service_id?: string;
          platform_email?: string | null;
          platform_password?: string | null;
          aleks_account?: string | null;
          additional_info?: string | null;
          encrypted_payload?: string | null;
          encryption_iv?: string | null;
          key_version?: number;
          expires_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      credential_access_log: {
        Row: {
          id: string;
          credential_id: string | null;
          order_id: string | null;
          accessed_by: string | null;
          requested_credential_id: string | null;
          action: string;
          success: boolean;
          reason_code: string | null;
          request_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          credential_id?: string | null;
          order_id?: string | null;
          accessed_by?: string | null;
          requested_credential_id?: string | null;
          action: string;
          success?: boolean;
          reason_code?: string | null;
          request_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          credential_id?: string | null;
          order_id?: string | null;
          accessed_by?: string | null;
          requested_credential_id?: string | null;
          action?: string;
          success?: boolean;
          reason_code?: string | null;
          request_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      referral_codes: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          uses_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code: string;
          uses_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          uses_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      referral_uses: {
        Row: {
          id: string;
          referral_code_id: string;
          used_by_user_id: string;
          order_id: string;
          discount_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          referral_code_id: string;
          used_by_user_id: string;
          order_id: string;
          discount_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          referral_code_id?: string;
          used_by_user_id?: string;
          order_id?: string;
          discount_amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      billing_information: {
        Row: {
          id: string;
          order_id: string;
          rfc: string;
          legal_name: string;
          postal_code: string;
          tax_regime: string;
          cfdi_use: 'G03' | 'S01';
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          rfc: string;
          legal_name: string;
          postal_code: string;
          tax_regime: string;
          cfdi_use: 'G03' | 'S01';
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          rfc?: string;
          legal_name?: string;
          postal_code?: string;
          tax_regime?: string;
          cfdi_use?: 'G03' | 'S01';
          created_at?: string;
        };
        Relationships: [];
      };
      admin_activity_log: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_table: string;
          target_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_table: string;
          target_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_table?: string;
          target_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_pending_order: {
        Args: {
          payment_method_param: string;
          referral_code_param?: string | null;
          credentials_param?: Json;
          billing_param?: Json | null;
        };
        Returns: {
          order_id: string;
          total_amount: number;
          discount_amount: number;
        }[];
      };
      create_secure_order: {
        Args: {
          p_order_id: string;
          p_user_id: string;
          p_payment_method: string;
          p_referral_code?: string | null;
          p_encrypted_credentials?: Json;
          p_billing?: Json | null;
        };
        Returns: {
          order_id: string;
          total_amount: number;
          discount_amount: number;
        }[];
      };
      check_reveal_rate_limit: {
        Args: {
          p_admin_id: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      complete_order_secure: {
        Args: {
          p_order_id: string;
          p_admin_id: string;
        };
        Returns: undefined;
      };
      reopen_order_secure: {
        Args: {
          p_order_id: string;
          p_admin_id: string;
        };
        Returns: undefined;
      };
      cleanup_expired_credentials: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };

      generate_referral_code: {
        Args: { user_id_param: string };
        Returns: string;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      validate_referral_code: {
        Args: { code_param: string };
        Returns: { valid: boolean; self_use: boolean }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Category = Database['public']['Tables']['categories']['Row'];
export type Service = Database['public']['Tables']['services']['Row'];
export type CartItem = Database['public']['Tables']['cart_items']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type SupportMessage = Database['public']['Tables']['support_messages']['Row'];
export type OrderCredential = Database['public']['Tables']['order_credentials']['Row'];
export type ReferralCode = Database['public']['Tables']['referral_codes']['Row'];
export type ReferralUse = Database['public']['Tables']['referral_uses']['Row'];
export type BillingInformation = Database['public']['Tables']['billing_information']['Row'];
