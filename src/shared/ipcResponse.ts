export type IpcSuccess<T> = { success: true; data: T };
export type IpcFailure = { success: false; error: string };
export type IpcResponse<T> = IpcSuccess<T> | IpcFailure;

export function ok<T>(data: T): IpcSuccess<T> {
  return { success: true, data };
}

export function fail(error: unknown): IpcFailure {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return { success: false, error: message };
}
