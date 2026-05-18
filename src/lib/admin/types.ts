export interface AdminUserRow {
  id: string;
  telegram_id: number | null;
  display_name: string | null;
  texas_username: string | null;
  role: string;
  subscription_end_date: string | null;
  subscription_active: boolean;
  license_key_id: string | null;
  registered_via: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  total: number;
}

export interface GenerateLicenseResponse {
  key: string;
  duration_months: string;
}
