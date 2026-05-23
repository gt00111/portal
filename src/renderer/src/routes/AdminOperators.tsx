import { Plus, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { APP_ROLES, type AppRole } from "@shared/auth.js";
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
}

const roleOptions = APP_ROLES.map((r) => ({ value: r, label: r }));

export function AdminOperators({ session }: Props): JSX.Element {
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
      toast.push("success", `${row.username} のポータル権限を ${role} に変更しました。`);
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Array<Column<OperatorRow>> = [
    { key: "id", header: "ID", width: "60px", align: "right", render: (r) => r.id },
    {
      key: "username",
      header: "ログイン名（マスタユーザー名と同一）",
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
      key: "role",
      header: "ポータル権限",
      width: "160px",
      render: (r) => (
        <select
          value={r.role}
          onChange={(e) => void changeRole(r, e.target.value as AppRole)}
          className="h-8 max-w-[11rem] rounded border border-border-strong bg-bg-surface px-2 text-xs"
        >
          {roleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "isActive",
      header: "状態",
      width: "120px",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => void toggleActive(r)}>
          {r.isActive ? (
            <>
              <ShieldCheck size={14} className="text-emerald-600" />
              有効
            </>
          ) : (
            <>
              <ShieldOff size={14} className="text-fg-subtle" />
              無効
            </>
          )}
        </Button>
      ),
    },
    {
      key: "mustChangePassword",
      header: "初回PW",
      width: "100px",
      render: (r) => (r.mustChangePassword ? "要変更" : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-fg-primary">操作者</h1>
        <p className="mt-1 text-sm text-fg-muted">
          ログインアカウントの追加・無効化とポータル設定権限（admin）の管理です。
          <strong className="text-fg-primary">業務アプリの権限・工程表示・グループ所属</strong>
          はマスターデータの「ユーザー権限」で設定してください。
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} />
            操作者を追加
          </Button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.id}
          empty={loading ? "読み込み中…" : "操作者がいません。"}
        />
      </Card>

      <CreateOperatorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await refresh();
          toast.push("success", "操作者を追加しました。マスタで業務権限を設定してください。");
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setPassword("");
      setRole("editor");
      setSubmitting(false);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      await invoke<OperatorRow>("operator:create", { username, password, role });
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
          label="ログイン名（同名のマスタユーザーを自動作成）"
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
          label="ポータル権限（DB・会社情報・マスタ編集は admin のみ）"
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          options={roleOptions}
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
