/**
 * Types for the schema in `supabase/migrations`.
 *
 * In a project linked to Supabase these are generated with
 * `supabase gen types typescript`. They are written by hand here so the
 * sample has no dependency on a live project.
 */
export type Plan = 'free' | 'pro';
export type RequestStatus = 'pending' | 'accepted' | 'declined';

export type ProfileRow = {
  id: string;
  display_name: string;
  plan: Plan;
  created_at: string;
};

export type ConnectionRequestRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: RequestStatus;
  created_at: string;
  responded_at: string | null;
};

export type ConnectionQuotaRow = {
  daily_limit: number;
  used: number;
  remaining: number;
  next_slot_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: { display_name?: string };
        Relationships: [];
      };
      connection_requests: {
        Row: ConnectionRequestRow;
        // Rows are only ever written by the database functions below.
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      send_connection_request: {
        Args: { p_recipient_id: string };
        Returns: ConnectionRequestRow;
      };
      respond_to_connection_request: {
        Args: { p_request_id: string; p_accept: boolean };
        Returns: ConnectionRequestRow;
      };
      connection_quota: {
        Args: Record<never, never>;
        Returns: ConnectionQuotaRow[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
