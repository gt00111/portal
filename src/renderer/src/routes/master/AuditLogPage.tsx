import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AuditEntry,
  AuditListParams,
  AuditListResult,
  AuditResult,
} from "@shared/audit.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

function formatDetail(detailJson: string | null): string {
  if (!detailJson) return "—";
  try {
    const obj = JSON.parse(detailJson);
    return JSON.stringify(obj);
  } catch {
    return detailJson;
  }
}

export function AuditLogPage(): JSX.Element {
  const toast = useToast();
  const [result, setResult] = useState<AuditListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [fromAt, setFromAt] = useState("");
  const [toAt, setToAt] = useState("");
  const [username, setUsername] = useState("");
  const [channel, setChannel] = useState("");
  const [resultFilter, setResultFilter] = useState<AuditResult | "">("");
  const [search, setSearch] = useState("");

  const [usernameOptions, setUsernameOptions] = useState<string[]>([]);
  const [channelOptions, setChannelOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params: AuditListParams = {
        fromAt: fromAt.trim() || null,
        toAt: toAt.trim() || null,
        username: username || null,
        channel: channel || null,
        result: resultFilter || null,
        page,
        pageSize,
      };
      const data = await invoke<AuditListResult>("audit:list", params);
      setResult(data);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [fromAt, toAt, username, channel, resultFilter, page, pageSize, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const [users, channels] = await Promise.all([
          invoke<string[]>("audit:listUsernames", {}),
          invoke<string[]>("audit:listChannels", {}),
        ]);
        setUsernameOptions(users);
        setChannelOptions(channels);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toLowerCase();
    if (!q) return result.rows;
    return result.rows.filter((r) =>
      [
        r.username ?? "",
        r.channel,
        r.action,
        r.targetType ?? "",
        r.targetId ?? "",
        r.errorMessage ?? "",
        r.detailJson ?? "",
      ]
        .join("\n")
        .toLowerCase()
        .includes(q)
    );
  }, [result, search]);

  function resetFilters(): void {
    setFromAt("");
    setToAt("");
    setUsername("");
    setChannel("");
    setResultFilter("");
    setSearch("");
    setPage(1);
  }

  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          開始日時
          <input
            type="datetime-local"
            value={fromAt}
            onChange={(e) => {
              setFromAt(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          終了日時
          <input
            type="datetime-local"
            value={toAt}
            onChange={(e) => {
              setToAt(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          ユーザー
          <select
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPage(1);
            }}
            className="h-10 min-w-[140px] rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
          >
            <option value="">（すべて）</option>
            {usernameOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          チャネル
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setPage(1);
            }}
            className="h-10 min-w-[200px] rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
          >
            <option value="">（すべて）</option>
            {channelOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          結果
          <select
            value={resultFilter}
            onChange={(e) => {
              const v = e.target.value;
              setResultFilter(v === "ok" || v === "fail" ? v : "");
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
          >
            <option value="">（すべて）</option>
            <option value="ok">成功</option>
            <option value="fail">失敗</option>
          </select>
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
          条件をクリア
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          更新
        </Button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          placeholder="このページ内を検索（ユーザー / チャネル / 対象 / エラー文）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm"
        />
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-center text-fg-muted">読み込み中...</p>
        ) : !result || result.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-fg-muted">該当する監査ログはありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/60 text-xs text-fg-muted">
                <tr>
                  <th className="whitespace-nowrap p-2 text-left">発生時刻</th>
                  <th className="whitespace-nowrap p-2 text-left">ユーザー</th>
                  <th className="whitespace-nowrap p-2 text-left">チャネル</th>
                  <th className="whitespace-nowrap p-2 text-left">操作</th>
                  <th className="whitespace-nowrap p-2 text-left">対象</th>
                  <th className="whitespace-nowrap p-2 text-left">結果</th>
                  <th className="p-2 text-left">詳細</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border-subtle hover:bg-bg-elevated/30"
                    onClick={() => setSelected(r)}
                  >
                    <td className="whitespace-nowrap p-2 font-mono text-xs">{r.occurredAt}</td>
                    <td className="whitespace-nowrap p-2">{r.username ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-xs">{r.channel}</td>
                    <td className="whitespace-nowrap p-2">{r.action}</td>
                    <td className="whitespace-nowrap p-2 text-xs">
                      {r.targetType ? `${r.targetType}#${r.targetId ?? "—"}` : "—"}
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {r.result === "ok" ? (
                        <span className="rounded-full bg-state-success/15 px-2 py-0.5 text-xs text-state-success">
                          成功
                        </span>
                      ) : (
                        <span className="rounded-full bg-state-danger/15 px-2 py-0.5 text-xs text-state-danger">
                          失敗
                        </span>
                      )}
                    </td>
                    <td className="max-w-[480px] truncate p-2 text-xs text-fg-muted">
                      {r.errorMessage ?? formatDetail(r.detailJson)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <span>
          {result?.total ?? 0} 件中 {page}/{totalPages} ページ
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span>表示件数</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-9 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} 件
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            前へ
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            次へ
          </Button>
        </div>
      </div>

      {selected && (
        <DetailDrawer entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DetailDrawer({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}): JSX.Element {
  let prettyDetail: string | null = null;
  if (entry.detailJson) {
    try {
      prettyDetail = JSON.stringify(JSON.parse(entry.detailJson), null, 2);
    } catch {
      prettyDetail = entry.detailJson;
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border-strong bg-bg-base p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-fg-primary">監査ログ詳細</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            閉じる
          </Button>
        </div>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-xs text-fg-muted">発生時刻</dt>
          <dd className="font-mono text-xs">{entry.occurredAt}</dd>
          <dt className="text-xs text-fg-muted">ユーザー</dt>
          <dd>{entry.username ?? "—"}（id: {entry.userNameId ?? "—"}）</dd>
          <dt className="text-xs text-fg-muted">アプリ</dt>
          <dd>{entry.appId ?? "—"}</dd>
          <dt className="text-xs text-fg-muted">チャネル</dt>
          <dd className="font-mono text-xs">{entry.channel}</dd>
          <dt className="text-xs text-fg-muted">操作</dt>
          <dd>{entry.action}</dd>
          <dt className="text-xs text-fg-muted">対象</dt>
          <dd>
            {entry.targetType ?? "—"}
            {entry.targetId ? ` #${entry.targetId}` : ""}
          </dd>
          <dt className="text-xs text-fg-muted">結果</dt>
          <dd>{entry.result === "ok" ? "成功" : "失敗"}</dd>
        </dl>
        {entry.errorMessage && (
          <div className="rounded-lg bg-state-danger/10 p-3 text-xs text-state-danger">
            <p className="mb-1 font-semibold">エラー</p>
            <p className="whitespace-pre-wrap break-words">{entry.errorMessage}</p>
          </div>
        )}
        {prettyDetail && (
          <div>
            <p className="mb-1 text-xs text-fg-muted">詳細 (JSON)</p>
            <pre className="overflow-auto rounded-lg border border-border-subtle bg-bg-surface p-3 text-xs">
              {prettyDetail}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
