import type { FC } from "react";

export interface MyCustomGanttProps {
  tasks: unknown[];
  readOnly?: boolean;
  onTaskDateChange?: (taskId: string, start: Date, end: Date) => void | Promise<void>;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  canDeleteTask?: (task: { id: string }) => boolean;
  onChildOrderChange?: (orderedChildIds: string[]) => void | Promise<void>;
  [key: string]: unknown;
}

declare const MyCustomGantt: FC<MyCustomGanttProps>;
export default MyCustomGantt;
