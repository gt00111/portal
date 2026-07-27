import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  TECHNICAL_NOTE_TYPES,
  type MachineOption,
  type ProcessHistory,
  type RevisionHistory,
  type TechnicalNote,
} from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Select } from "@renderer/components/ui/Select.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";

const TEXTAREA_CLASS = cn(
  "min-h-[72px] w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary",
  "placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
);

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ==================== 技術ノート ==================== */

const NOTE_TYPE_OPTIONS = [
  { value: "", label: "（種別なし）" },
  ...TECHNICAL_NOTE_TYPES.map((t) => ({ value: t, label: t })),
];

export function TechnicalNotesPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const [notes, setNotes] = useState<TechnicalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newType, setNewType] = useState("");
  const [newBody, setNewBody] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState("");
  const [editBody, setEditBody] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<TechnicalNote[]>("smsupport:technicalNote:listByPart", {
        partNumber,
      });
      setNotes(data);
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [partNumber, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(): Promise<void> {
    if (!newBody.trim()) {
      toast.push("error", "本文を入力してください。");
      return;
    }
    setSaving(true);
    try {
      await invoke<TechnicalNote>("smsupport:technicalNote:create", {
        partNumber,
        noteType: newType || null,
        body: newBody.trim(),
      });
      setNewType("");
      setNewBody("");
      toast.push("success", "技術ノートを追加しました。");
      await load();
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(note: TechnicalNote): void {
    setEditingId(note.id);
    setEditType(note.noteType ?? "");
    setEditBody(note.body);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditType("");
    setEditBody("");
  }

  async function handleUpdate(id: number): Promise<void> {
    if (!editBody.trim()) {
      toast.push("error", "本文を入力してください。");
      return;
    }
    setSaving(true);
    try {
      await invoke<TechnicalNote>("smsupport:technicalNote:update", {
        id,
        noteType: editType || null,
        body: editBody.trim(),
      });
      cancelEdit();
      toast.push("success", "技術ノートを更新しました。");
      await load();
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm("この技術ノートを削除しますか？")) return;
    try {
      await invoke<{ id: number }>("smsupport:technicalNote:delete", { id });
      toast.push("success", "技術ノートを削除しました。");
      await load();
    } catch (err) {
      toast.push("error", errMsg(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {writable && (
        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-surface/60 p-3">
          <div className="max-w-[220px]">
            <Select
              label="種別"
              value={newType}
              options={NOTE_TYPE_OPTIONS}
              onChange={(e) => setNewType(e.target.value)}
            />
          </div>
          <textarea
            className={TEXTAREA_CLASS}
            placeholder="改善案・注意事項・現場メモなどを記録"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleCreate()}>
              <Plus className="h-4 w-4" aria-hidden />
              <span>追加</span>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-fg-muted">読み込み中...</p>
      ) : notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">技術ノートはまだありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border border-border-subtle bg-bg-surface/50 p-3"
            >
              {editingId === note.id ? (
                <div className="flex flex-col gap-2">
                  <div className="max-w-[220px]">
                    <Select
                      label="種別"
                      value={editType}
                      options={NOTE_TYPE_OPTIONS}
                      onChange={(e) => setEditType(e.target.value)}
                    />
                  </div>
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="h-4 w-4" aria-hidden />
                      <span>取消</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving}
                      onClick={() => void handleUpdate(note.id)}
                    >
                      <span>保存</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {note.noteType ? (
                        <span className="rounded-md bg-accent-primary/15 px-1.5 py-0.5 text-xs font-medium text-accent-primary">
                          {note.noteType}
                        </span>
                      ) : null}
                    </div>
                    {writable && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(note)}
                          title="編集"
                          className="rounded p-1 text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(note.id)}
                          title="削除"
                          className="rounded p-1 text-fg-muted hover:bg-state-danger/15 hover:text-state-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-fg-primary">{note.body}</p>
                  <p className="text-[11px] text-fg-subtle">
                    {note.updatedByName ? `${note.updatedByName} ・ ` : ""}
                    {note.updatedAt}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ==================== 加工履歴 ==================== */

export function ProcessHistoryPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<ProcessHistory[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [processedAt, setProcessedAt] = useState("");
  const [machineId, setMachineId] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ProcessHistory[]>("smsupport:processHistory:listByPart", {
        partNumber,
      });
      setRows(data);
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [partNumber, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!writable) return;
    void (async () => {
      try {
        const data = await invoke<MachineOption[]>("smsupport:listMachines", {});
        setMachines(data);
      } catch (err) {
        toast.push("error", errMsg(err));
      }
    })();
  }, [writable, toast]);

  async function handleCreate(): Promise<void> {
    setSaving(true);
    try {
      await invoke<ProcessHistory>("smsupport:processHistory:create", {
        partNumber,
        processedAt: processedAt || null,
        machineId: machineId ? Number(machineId) : null,
        isTest,
        comment: comment.trim() || null,
      });
      setProcessedAt("");
      setMachineId("");
      setIsTest(false);
      setComment("");
      toast.push("success", "加工履歴を追加しました。");
      await load();
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const machineOptions = [
    { value: "", label: "（機械なし）" },
    ...machines.map((m) => ({ value: String(m.id), label: m.name })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {writable && (
        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-surface/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-fg-muted">加工日</span>
              <input
                type="date"
                value={processedAt}
                onChange={(e) => setProcessedAt(e.target.value)}
                className="h-10 rounded-lg border border-border-strong bg-bg-surface px-3 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              />
            </label>
            <Select
              label="機械"
              value={machineId}
              options={machineOptions}
              onChange={(e) => setMachineId(e.target.value)}
            />
          </div>
          <textarea
            className={TEXTAREA_CLASS}
            placeholder="コメント（加工時の気づき・結果など）"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-primary">
              <input
                type="checkbox"
                checked={isTest}
                onChange={(e) => setIsTest(e.target.checked)}
                className="rounded border-border-strong"
              />
              テスト加工
            </label>
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleCreate()}>
              <Plus className="h-4 w-4" aria-hidden />
              <span>追加</span>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-fg-muted">読み込み中...</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">加工履歴はまだありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-border-subtle bg-bg-surface/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg-primary">
                    {row.processedAt || "日付なし"}
                  </span>
                  {row.isTest ? (
                    <span className="rounded-md bg-state-warning/15 px-1.5 py-0.5 text-xs font-medium text-state-warning">
                      テスト加工
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-fg-muted">{row.machineName ?? "—"}</span>
              </div>
              {row.comment ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-fg-primary">{row.comment}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-fg-subtle">
                {row.createdByName ? `${row.createdByName} ・ ` : ""}
                {row.createdAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ==================== 更新履歴 ==================== */

export function RevisionHistoryPanel({ partNumber }: { partNumber: string }): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<RevisionHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const data = await invoke<RevisionHistory[]>("smsupport:revisionHistory:listByPart", {
          partNumber,
        });
        setRows(data);
      } catch (err) {
        toast.push("error", errMsg(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [partNumber, toast]);

  if (loading) {
    return <p className="py-4 text-center text-sm text-fg-muted">読み込み中...</p>;
  }
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-fg-muted">更新履歴はまだありません。</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-lg border border-border-subtle bg-bg-surface/50 px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-fg-primary">{row.fieldName}</span>
            <span className="text-fg-subtle">{row.changedAt}</span>
          </div>
          {row.oldValue != null || row.newValue != null ? (
            <p className="mt-0.5 text-fg-muted">
              <span className="line-through opacity-70">{row.oldValue ?? "（なし）"}</span>
              {" → "}
              <span className="text-fg-primary">{row.newValue ?? "（なし）"}</span>
            </p>
          ) : null}
          {row.changedByName ? (
            <p className="mt-0.5 text-fg-subtle">{row.changedByName}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
