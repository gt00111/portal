import { Bell, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PmTaskCompletionNotification } from "@shared/processMgmt.js";

import { Button } from "@renderer/components/ui/Button.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";

const POLL_MS = 45_000;

function formatCompletedAt(iso: string): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

interface Props {
  username: string;
  enabled: boolean;
}

/** 工程タスク完了のインナー通知（管理者のみ。確認するまで一覧に残る） */
export function ProcessMgmtNotificationBell({ username, enabled }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PmTaskCompletionNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!enabled || !username.trim()) return;
    const quiet = opts?.quiet === true;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await invoke<PmTaskCompletionNotification[]>("process-mgmt:notify:listPending", undefined);
      setItems(Array.isArray(list) ? list : []);
      setAckError(null);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, username]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = window.setInterval(() => void load({ quiet: true }), POLL_MS);
    function onVis(): void {
      if (document.visibilityState === "visible") void load({ quiet: true });
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, load]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  async function acknowledge(id: number): Promise<void> {
    setAckError(null);
    try {
      await invoke("process-mgmt:notify:acknowledge", { id });
      await load({ quiet: true });
    } catch (err) {
      setAckError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!enabled) return null;

  const pending = items.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          void load({ quiet: true });
        }}
        className={cn(
          "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-fg-muted transition-colors",
          "hover:bg-bg-elevated hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        )}
        aria-expanded={open}
        aria-label={`完了通知${pending > 0 ? `（未確認 ${pending} 件）` : ""}`}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {pending > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-state-danger px-1 text-[10px] font-bold text-white tabular-nums">
            {pending > 99 ? "99+" : pending}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,85vh)] overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg">
          <div className="flex items-start gap-2 border-b border-border-subtle px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg-primary">タスク完了の通知</p>
              <p className="text-xs text-fg-subtle">
                未確認の間、ここに残ります。内容を確認したら「確認」で消えます。自動更新は約{" "}
                {Math.round(POLL_MS / 1000)} 秒ごとなどのため、最新をすぐ見るときは「更新」。
              </p>
            </div>
            <button
              type="button"
              disabled={refreshing}
              title="通知一覧を今すぐ取り直す"
              aria-label="通知を更新"
              onClick={() => void load({ quiet: true })}
              className={cn(
                "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated text-fg-muted transition-colors",
                "hover:bg-bg-base hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                refreshing && "cursor-wait opacity-70"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            </button>
          </div>
          <div className="max-h-[min(24rem,70vh)] overflow-y-auto p-2">
            {loading && items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-fg-muted">読み込み中…</p>
            ) : null}
            {!loading && items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-fg-muted">未確認の通知はありません。</p>
            ) : null}
            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-border-subtle bg-bg-elevated/50 p-3 text-sm text-fg-primary"
                >
                  <div className="mb-2 space-y-1 text-xs leading-snug text-fg-muted">
                    <p>
                      <span className="font-medium text-fg-primary">{n.summary.title}</span>
                      <span className="text-fg-subtle"> · {n.summary.processType}</span>
                    </p>
                    <p>{n.summary.projectName}</p>
                    <p>
                      {n.summary.client} / {n.summary.drawingNumber} Rev {n.summary.revision}
                    </p>
                    <p>担当: {n.summary.assignee || "—"}</p>
                    <p>
                      完了: {n.completedBy} · {formatCompletedAt(n.taskCompletedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => void acknowledge(n.id)}
                  >
                    確認（一覧から消す）
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          {ackError ? (
            <p className="border-t border-border-subtle px-3 py-2 text-xs text-state-danger">{ackError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
