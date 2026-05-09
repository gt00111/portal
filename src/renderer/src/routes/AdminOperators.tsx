import { Plus, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { APP_ROLES, type AppRole } from "@shared/auth.js";
import { PROCESS_VIEWS, PROCESS_VIEW_LABELS, type ProcessView } from "@shared/processView.js";
import type { OperatorRow, SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface Props {
  session: SessionUser;
  onSyncSession?: () => Promise<SessionUser>;
}

const roleOptions = APP_ROLES.map((r) => ({ value: r, label: r }));

const processViewOptions = PROCESS_VIEWS.map((v) => ({
  value: v,
  label: PROCESS_VIEW_LABELS[v],
}));

export function AdminOperators({ session, onSyncSession }: Props): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<OperatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<OperatorRow[]>("operator:list");
      setRows(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function changeProcessView(row: OperatorRow, processView: ProcessView): Promise<void> {
    if (processView === row.processView) return;
    try {
      await invoke<null>("operator:updateProcessView", { id: row.id, processView });
      toast.push("success", `${row.username} の工程表示を更新しました。`);
      if (row.id === session.id) {
        await onSyncSession?.();
      }
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleActive(row: OperatorRow): Promise<void> {
    try {
      await invoke<null>("operator:setActive", {
        id: row.id,
        isActive: !row.isActive,
      });
      toast.push("success", `${row.username} を${row.isActive ? "無効化" : "有効化"}しました。`);
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function changeRole(row: OperatorRow, role: AppRole): Promise<void> {
    if (role === row.role) return;
    try {
      await invoke<null>("operator:updateRole", { id: row.id, role });
      toast.push("success", `${row.username} の権限を ${role} に変更しました。`);
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Array<Column<OperatorRow>> = [
    { key: "id", header: "ID", width: "60px", align: "right", render: (r) => r.id },
    {
      key: "username",
      header: "ユーザー名",
      render: (r) => (
        <span className="font-medium">
          {r.username}
          {r.id === session.id && (
            <span className="ml-2 rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] text-accent-primary">
              you
            </span>
          )}
        </span>
      ),
    },
    {
      key: "processView",
      header: "工程表示",
      width: "200px",
      render: (r) => (
        <select
          value={r.processView}
          onChange={(e) => void changeProcessView(r, e.target.value as ProcessView)}
          className="h-8 max-w-[11rem] rounded border border-border-strong bg-bg-surface px-2 text-xs"
        >
          {processViewOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "role",
      header: "権限",
      width: "160px",
      render: (r) => (
        <select
          value={r.role}
          onChange={(e) => changeRole(r, e.target.value as AppRole)}
          disabled={r.id === session.id}
          className="h-8 rounded border border-border-strong bg-bg-surface px-2 text-xs"
        >
          {APP_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "isActive",
      header: "状態",
      width: "120px",
      render: (r) =>
        r.isActive ? (
          <span className="rounded-full bg-state-success/15 px-2 py-0.5 text-xs text-state-success">
            有効
          </span>
        ) : (
          <span className="rounded-full bg-state-danger/15 px-2 py-0.5 text-xs text-state-danger">
            無効
          </span>
        ),
    },
    {
      key: "mustChangePassword",
      header: "PW変更",
      width: "100px",
      render: (r) => (r.mustChangePassword ? "要" : "—"),
    },
    {
      key: "updatedAt",
      header: "更新",
      width: "180px",
      render: (r) => <span className="text-xs text-fg-muted">{r.updatedAt}</span>,
    },
    {
      key: "action",
      header: "",
      width: "100px",
      align: "right",
      render: (r) => (
        <Button
          variant={r.isActive ? "ghost" : "secondary"}
          size="sm"
          onClick={() => toggleActive(r)}
          disabled={r.id === session.id}
        >
          {r.isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
          {r.isActive ? "無効化" : "有効化"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">操作者</h1>
          <p className="text-sm text-fg-muted">
            ポータルのログインアカウントを管理します。最後の有効な管理者は無効化・降格できません。
            <span className="mt-1 block">
              <strong>工程表示</strong>
              は工程管理アプリのボード・案件タスクの見え方です（Flask 原型の process_view と同様。
              <code className="text-fg-subtle">solidworks</code> /{" "}
              <code className="text-fg-subtle">cadmac</code> /{" "}
              <code className="text-fg-subtle">both</code>
              ）。自分の設定を変えた場合は一覧更新でセッションが同期されます。
            </span>
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} />
          追加
        </Button>
      </header>

      <Card className="p-0">
        {loading ? (
          <p className="p-6 text-center text-fg-muted">読み込み中...</p>
        ) : (
          <DataTable rows={rows} columns={columns} keyOf={(r) => r.id} />
        )}
      </Card>

      <CreateOperatorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await refresh();
          toast.push("success", "操作者を追加しました。");
        }}
        onError={(msg) => toast.push("error", msg)}
      />
    </div>
  );
}

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}

function CreateOperatorModal({ open, onClose, onCreated, onError }: CreateProps): JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("editor");
  const [processView, setProcessView] = useState<ProcessView>("both");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setPassword("");
      setRole("editor");
      setProcessView("both");
      setSubmitting(false);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      await invoke<OperatorRow>("operator:create", { username, password, role, processView });
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="操作者を追加">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="ユーザー名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <TextField
          label="初期パスワード（6 文字以上、本人が初回ログインで変更）"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Select
          label="権限"
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          options={roleOptions}
        />
        <Select
          label="工程表示（工程管理アプリ）"
          value={processView}
          onChange={(e) => setProcessView(e.target.value as ProcessView)}
          options={processViewOptions}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            <Plus size={16} />
            {submitting ? "作成中..." : "作成"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
