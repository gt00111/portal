export interface ProcessTemplate {
  id: string;
  name: string;
  sort_order: number;
  default_days: number;
  color: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}
