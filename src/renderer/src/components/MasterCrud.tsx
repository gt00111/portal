import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  type MasterExtraField,
  type MasterExtraValues,
  type MasterRow,
  type MasterTable,
  type MasterUpsertInput,
  MASTER_TABLE_LABELS,
  isChoiceField,
  isMachineLinkedMasterTable,
  isNumberField,
  isScopedMasterTable,
  isTextField,
  masterExtraFields,
} from "@shared/master.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface ScopeChoice {
  value: string;
  label: string;
}

interface Props {
  table: MasterTable;
  canWrite: boolean;
  /** scope 付きマスタで利用する scope リスト（空なら自動で「すべて」のみ） */
  scopes?: ScopeChoice[];
  /** 既定の scope（フィルタおよび新規作成のデフォルト） */
  defaultScope?: string;
}

export function MasterCrud({ table, canWrite, scopes, defaultScope }: Props): JSX.Element {
  const toast = useToast();
  const scoped = isScopedMasterTable(table);
  const extraFields = masterExtraFields(table);
  const machineLinked = isMachineLinkedMasterTable(table);
  const [machines, setMachines] = useState<MasterRow[]>([]);
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<string>(defaultScope ?? "");

  useEffect(() => {
    setScope(defaultScope ?? "");
  }, [defaultScope, table]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<MasterRow[]>("master:list", {
        table,
        scope: scoped && scope ? scope : null,
      });
      setRows(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [table, toast, scoped, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 対応機械の選択肢（機械紐付けマスタのみ）
  useEffect(() => {
    if (!machineLinked) {
      setMachines([]);
      return;
    }
    void (async () => {
      try {
        setMachines(await invoke<MasterRow[]>("master:list", { table: "m_machines" }));
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      }
    })();
  }, [machineLinked, toast]);

  const machineNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of machines) map.set(m.id, m.name);
    return map;
  }, [machines]);

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

  const scopeLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of scopes ?? []) m.set(s.value, s.label);
    return m;
  }, [scopes]);

  const columns: Array<Column<MasterRow>> = [
    { key: "id", header: "ID", width: "60px", align: "right", render: (r) => r.id },
    ...(scoped
      ? [
          {
            key: "scope",
            header: "用途",
            width: "200px",
            render: (r: MasterRow) => (
              <span className="text-xs text-fg-muted">
                {r.scope ? scopeLookup.get(r.scope) ?? r.scope : "—"}
              </span>
            ),
          } satisfies Column<MasterRow>,
        ]
      : []),
    { key: "code", header: "コード", width: "180px", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "名称", render: (r) => r.name },
    ...extraFields
      .filter((f) => f.inList)
      .map(
        (f) =>
          ({
            key: f.key,
            header: isNumberField(f) ? `${f.label}(${f.unit})` : f.label,
            width: "110px",
            align: isNumberField(f) ? "right" : "left",
            render: (r: MasterRow) => {
              const value = r.extra?.[f.key];
              if (value == null) return <span className="text-fg-subtle">—</span>;
              if (isChoiceField(f)) {
                const option = f.options.find((o) => o.value === value);
                return <span className="text-xs">{option?.label ?? String(value)}</span>;
              }
              if (!isNumberField(f)) return <span className="text-xs">{String(value)}</span>;
              return <span className="font-mono text-xs">{value}</span>;
            },
          }) satisfies Column<MasterRow>
      ),
    ...(machineLinked
      ? [
          {
            key: "machines",
            header: "対応機械",
            width: "200px",
            render: (r: MasterRow) => {
              const ids = r.machineIds ?? [];
              if (ids.length === 0) {
                return <span className="text-xs text-fg-muted">すべて（共用）</span>;
              }
              return (
                <span className="text-xs text-fg-primary">
                  {ids.map((id) => machineNameById.get(id) ?? `#${id}`).join("・")}
                </span>
              );
            },
          } satisfies Column<MasterRow>,
        ]
      : []),
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            placeholder={`${MASTER_TABLE_LABELS[table]} を検索（コード / 名称 / 備考）`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
        </div>
        {scoped && scopes && scopes.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            用途
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg-primary"
            >
              <option value="">（すべて）</option>
              {scopes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
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
        scoped={scoped}
        extraFields={extraFields}
        machines={machineLinked ? machines : null}
        scopes={scopes ?? []}
        defaultScope={scope || defaultScope || (scopes?.[0]?.value ?? "")}
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
  scoped: boolean;
  extraFields: readonly MasterExtraField[];
  /** 対応機械の選択肢。null は機械紐付けを持たないマスタ。 */
  machines: MasterRow[] | null;
  scopes: ScopeChoice[];
  defaultScope: string;
  onClose: () => void;
  onSubmit: (input: MasterUpsertInput) => Promise<void>;
}

function UpsertModal({
  open,
  title,
  initial,
  scoped,
  extraFields,
  machines,
  scopes,
  defaultScope,
  onClose,
  onSubmit,
}: UpsertProps): JSX.Element {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [scope, setScope] = useState<string>("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(initial?.code ?? "");
      setName(initial?.name ?? "");
      setNote(initial?.note ?? "");
      setIsActive(initial?.isActive ?? true);
      setScope(initial?.scope ?? defaultScope ?? "");
      const values: Record<string, string> = {};
      for (const field of extraFields) {
        const value = initial?.extra?.[field.key];
        values[field.key] = value == null ? "" : String(value);
      }
      setExtra(values);
      setMachineIds(initial?.machineIds ?? []);
      setSubmitting(false);
    }
  }, [open, initial, defaultScope, extraFields]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (scoped && !scope.trim()) {
      window.alert("用途（scope）を選択してください。");
      return;
    }
    let extraValues: MasterExtraValues | undefined;
    if (extraFields.length > 0) {
      extraValues = {};
      for (const field of extraFields) {
        const raw = extra[field.key]?.trim() ?? "";
        if (raw === "") {
          extraValues[field.key] = null;
        } else {
          extraValues[field.key] = isNumberField(field) ? Number(raw) : raw;
        }
      }
    }
    setSubmitting(true);
    await onSubmit({
      code,
      name,
      note,
      isActive,
      scope: scoped ? scope : undefined,
      extra: extraValues,
      machineIds: machines ? machineIds : undefined,
    });
    setSubmitting(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {scoped && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-fg-muted">用途（必須）</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              required
              className="rounded-lg border border-border-strong bg-bg-surface p-3 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <option value="">— 選択してください —</option>
              {scopes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <TextField
          label="コード（同じ用途内で一意）"
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
        {machines && (
          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-elevated/50 p-3">
            <p className="text-xs text-fg-muted">
              対応機械（1 台も選ばない場合は「すべての機械で共用」として扱います）
            </p>
            {machines.length === 0 ? (
              <p className="text-xs text-fg-subtle">
                機械マスタが未登録です。「機械」タブで登録してください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {machines.map((machine) => (
                  <label
                    key={machine.id}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-fg-primary"
                  >
                    <input
                      type="checkbox"
                      checked={machineIds.includes(machine.id)}
                      onChange={(e) =>
                        setMachineIds((prev) =>
                          e.target.checked
                            ? [...prev, machine.id]
                            : prev.filter((id) => id !== machine.id)
                        )
                      }
                      className="h-4 w-4 rounded border-border-strong"
                    />
                    {machine.name}
                  </label>
                ))}
              </div>
            )}
            {machineIds.length === 0 && machines.length > 0 && (
              <p className="text-xs text-fg-subtle">
                現在の設定：すべての機械で使用できる金型として扱われます。
              </p>
            )}
          </div>
        )}
        {extraFields.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 p-3">
            <p className="text-xs text-fg-muted">
              型式・寸法・能力（未入力の項目は判定に使用されません）
            </p>
            <div className="grid grid-cols-2 gap-3">
              {extraFields.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-sm">
                  <span className="text-fg-muted">
                    {field.label}
                    {isNumberField(field) && (
                      <span className="ml-1 text-xs text-fg-subtle">({field.unit})</span>
                    )}
                  </span>
                  {isChoiceField(field) ? (
                    <select
                      value={extra[field.key] ?? ""}
                      onChange={(e) =>
                        setExtra((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="h-[38px] rounded-lg border border-border-strong bg-bg-surface px-2 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                    >
                      <option value="">—</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : isTextField(field) ? (
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      value={extra[field.key] ?? ""}
                      onChange={(e) =>
                        setExtra((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="rounded-lg border border-border-strong bg-bg-surface p-2 text-fg-primary placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={field.step ?? 1}
                      value={extra[field.key] ?? ""}
                      onChange={(e) =>
                        setExtra((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="rounded-lg border border-border-strong bg-bg-surface p-2 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                    />
                  )}
                  {field.hint && <span className="text-xs text-fg-subtle">{field.hint}</span>}
                </label>
              ))}
            </div>
          </div>
        )}
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
