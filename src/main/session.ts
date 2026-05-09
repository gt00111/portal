import type { SessionUser } from "@shared/types.js";

let current: SessionUser | null = null;

export function setSession(user: SessionUser): void {
  current = user;
}

export function clearSession(): void {
  current = null;
}

export function getSession(): SessionUser | null {
  return current;
}

export function updateSession(patch: Partial<SessionUser>): void {
  if (!current) return;
  current = { ...current, ...patch };
}
