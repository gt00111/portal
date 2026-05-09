export type ProjectStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "in_planning"
  | "in_progress"
  | "done"
  | "canceled";

export interface Project {
  id: string;
  project_no: string | null;
  received_at: string | null;
  input_by_user_id: string;
  company_id: string;
  project_name: string | null;
  request_content: string | null;
  deadline: string;
  group_id: string | null;
  status: ProjectStatus;
  priority: number;
  model_type: string | null;
  part_number: string | null;
  unit_number: string | null;
  /** 図面・設変のリビジョン（例: A, 01） */
  revision: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithRelations extends Project {
  company_name: string;
  group_name: string | null;
  input_by_username: string;
  input_by_display_name: string | null;
}
