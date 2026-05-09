export type TaskType = "project" | "task" | "milestone";

export type TaskStatus = "planned" | "in_progress" | "done";

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  task_type: TaskType;
  process_template_id?: string | null;
  text: string;
  start_date: string;
  end_date: string;
  progress: number;
  status: TaskStatus;
  sort_order: number;
  depends_on_task_id: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithProject extends Task {
  project_no: string | null;
  company_id: string;
  project_deadline: string;
  company_name: string;
  project_name: string | null;
  group_name: string | null;
  model_type: string | null;
  part_number: string | null;
  unit_number: string | null;
}
