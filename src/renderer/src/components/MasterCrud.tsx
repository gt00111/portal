import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  type MasterRow,
  type MasterTable,
  type MasterUpsertInput,
  MASTER_TABLE_LABELS,
} from "@shared/master.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface Props {
  table: MasterTable;
  canWrite: boolean;
}

export function MasterCrud({ table, canWrite }: Props): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<MasterRow[]>("master:list", { table });
      setRows(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [table, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function handleDelete(row: MasterRow): Promise<void> {
    if (!window.confirm(`「${row.code} : ${row.name}」を削除します。よろしいですか？`)) return;
    try {
      await invoke<null>("master:delete", { table, id: row.id });
      toast.push("success", "削除しました。");
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Array<Column<MasterRow>> = [
    { key: "id", header: "ID", width: "60px", align: "right", render: (r) => r.id },
    { key: "code", header: "コード", width: "180px", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "名称", render: (r) => r.name },
    { key: "note", header: "備考", render: (r) => <span className="text-fg-muted">{r.note ?? "—"}</span> },
    {
      key: "isActive",
      header: "状態",
      width: "90px",
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
    { key: "updatedAt", header: "更新", width: "180px", render: (r) => <span className="text-xs text-fg-muted">{r.updatedAt}</span> },
    {
      key: "action",
      header: "",
      width: "140px",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(r)}
            disabled={!canWrite}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(r)}
            disabled={!canWrite}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            placeholder={`${MASTER_TABLE_LABELS[table]} を検索（コード / 名称 / 備考）`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          disabled={!canWrite}
        >
          <Plus size={16} />
          追加
        </Button>
      </div>

      <Card className="p-0">
        {loading ? (
          <p className="p-6 text-center text-fg-muted">読み込み中...</p>
        ) : (
          <DataTable rows={filtered} columns={columns} keyOf={(r) => r.id} />
        )}
      </Card>

      <UpsertModal
        open={creating || editing !== null}
        title={editing ? `${MASTER_TABLE_LABELS[table]} を編集` : `${MASTER_TABLE_LABELS[table]} を追加`}
        initial={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSubmit={async (input) => {
          try {
            if (editing) {
              await invoke<MasterRow>("master:update", { table, id: editing.id, input });
              toast.push("success", "更新しました。");
            } else {
              await invoke<MasterRow>("master:create", { table, input });
              toast.push("success", "追加しました。");
            }
            setEditing(null);
            setCreating(false);
            await refresh();
          } catch (err) {
            toast.push("error", err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </div>
  );
}

interface UpsertProps {
  open: boolean;
  title: string;
  initial: MasterRow | null;
  onClose: () => void;
  onSubmit: (input: MasterUpsertInput) => Promise<void>;
}

function UpsertModal({ open, title, initial, onClose, onSubmit }: UpsertProps): JSX.Element {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(initial?.code ?? "");
      setName(initial?.name ?? "");
      setNote(initial?.note ?? "");
      setIsActive(initial?.isActive ?? true);
      setSubmitting(false);
    }
  }, [open, initial]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await onSubmit({ code, name, note, isActive });
    setSubmitting(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="コード（一意）"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
        />
        <TextField
          label="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">備考</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-lg border border-border-strong bg-bg-surface p-3 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong"
          />
          <span>有効</span>
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
