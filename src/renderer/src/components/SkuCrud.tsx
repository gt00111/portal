import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { MasterRow, MasterTable } from "@shared/master.js";
import type { SkuRow, SkuUpsertInput } from "@shared/sku.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface MasterCache {
  m_customers: MasterRow[];
  m_models: MasterRow[];
  m_part_numbers: MasterRow[];
  m_component_names: MasterRow[];
}

const MASTER_KEYS: Array<keyof MasterCache> = [
  "m_customers",
  "m_models",
  "m_part_numbers",
  "m_component_names",
];

interface Props {
  canWrite: boolean;
}

export function SkuCrud({ canWrite }: Props): JSX.Element {
  const toast = useToast();
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [masters, setMasters] = useState<MasterCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SkuRow | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [skus, ...lists] = await Promise.all([
        invoke<SkuRow[]>("sku:list"),
        ...MASTER_KEYS.map((t) => invoke<MasterRow[]>("master:list", { table: t as MasterTable })),
      ]);
      setRows(skus);
      const cache: MasterCache = {
        m_customers: lists[0],
        m_models: lists[1],
        m_part_numbers: lists[2],
        m_component_names: lists[3],
      };
      setMasters(cache);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.customerCode,
        r.customerName,
        r.modelCode,
        r.modelName,
        r.partNumberCode,
        r.partNumberName,
        r.componentNameCode,
        r.componentNameName,
        r.drawingNumber,
        r.revision,
        r.note,
      ]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, search]);

  async function handleDelete(row: SkuRow): Promise<void> {
    if (!window.confirm(`SKU #${row.id} を削除します。よろしいですか？`)) return;
    try {
      await invoke<null>("sku:delete", { id: row.id });
      toast.push("success", "削除しました。");
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const columns: Array<Column<SkuRow>> = [
    { key: "id", header: "ID", width: "60px", align: "right", render: (r) => r.id },
    { key: "customer", header: "客先", render: (r) => formatRef(r.customerCode, r.customerName) },
    { key: "model", header: "機種", render: (r) => formatRef(r.modelCode, r.modelName) },
    { key: "partNumber", header: "図面番号(品番)", render: (r) => formatRef(r.partNumberCode, r.partNumberName) },
    { key: "componentName", header: "部品名称", render: (r) => formatRef(r.componentNameCode, r.componentNameName) },
    { key: "drawingNumber", header: "図面番号（台帳）", render: (r) => r.drawingNumber ?? "—" },
    { key: "revision", header: "Rev", width: "80px", render: (r) => r.revision ?? "—" },
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
    {
      key: "action",
      header: "",
      width: "120px",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(r)} disabled={!canWrite}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} disabled={!canWrite}>
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
            placeholder="SKU を検索（マスタ・図面番号(品番)・台帳・Rev・備考）"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          disabled={!canWrite || !masters}
        >
          <Plus size={16} />
          追加
        </Button>
      </div>

      <Card className="p-0">
        {loading || !masters ? (
          <p className="p-6 text-center text-fg-muted">読み込み中...</p>
        ) : (
          <DataTable rows={filtered} columns={columns} keyOf={(r) => r.id} />
        )}
      </Card>

      {masters && (
        <SkuUpsertModal
          open={creating || editing !== null}
          title={editing ? "SKU を編集" : "SKU を追加"}
          initial={editing}
          masters={masters}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={async (input) => {
            try {
              if (editing) {
                await invoke<SkuRow>("sku:update", { id: editing.id, input });
                toast.push("success", "更新しました。");
              } else {
                await invoke<SkuRow>("sku:create", { input });
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
      )}
    </div>
  );
}

function formatRef(code: string | null, name: string | null): JSX.Element {
  if (!code && !name) return <span className="text-fg-subtle">—</span>;
  return (
    <span>
      <span className="font-mono text-xs text-fg-muted">{code ?? "?"}</span>
      <span className="ml-2">{name ?? ""}</span>
    </span>
  );
}

interface UpsertProps {
  open: boolean;
  title: string;
  initial: SkuRow | null;
  masters: MasterCache;
  onClose: () => void;
  onSubmit: (input: SkuUpsertInput) => Promise<void>;
}

/** 図面番号(品番)マスタ → 図面番号（台帳）の既定値（名称優先、なければコード） */
function defaultLedgerDrawingFromPartMaster(row: MasterRow | undefined): string {
  if (!row) return "";
  const name = row.name.trim();
  const code = row.code.trim();
  return name || code;
}

function SkuUpsertModal({ open, title, initial, masters, onClose, onSubmit }: UpsertProps): JSX.Element {
  const [customerId, setCustomerId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [partNumberId, setPartNumberId] = useState<string>("");
  const [componentNameId, setComponentNameId] = useState<string>("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [revision, setRevision] = useState("");
  const [note, setNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId(initial?.customerId?.toString() ?? "");
      setModelId(initial?.modelId?.toString() ?? "");
      setPartNumberId(initial?.partNumberId?.toString() ?? "");
      setComponentNameId(initial?.componentNameId?.toString() ?? "");
      setDrawingNumber(initial?.drawingNumber ?? "");
      setRevision(initial?.revision ?? "");
      setNote(initial?.note ?? "");
      setIsActive(initial?.isActive ?? true);
      setSubmitting(false);
    }
  }, [open, initial]);

  function buildOptions(rows: MasterRow[]): Array<{ value: string; label: string }> {
    return [
      { value: "", label: "（未指定）" },
      ...rows
        .filter((r) => r.isActive)
        .map((r) => ({ value: r.id.toString(), label: `${r.code} : ${r.name}` })),
    ];
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await onSubmit({
      customerId: customerId ? Number(customerId) : null,
      modelId: modelId ? Number(modelId) : null,
      partNumberId: partNumberId ? Number(partNumberId) : null,
      componentNameId: componentNameId ? Number(componentNameId) : null,
      drawingNumber,
      revision,
      note,
      isActive,
    });
    setSubmitting(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="客先"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={buildOptions(masters.m_customers)}
          />
          <Select
            label="機種"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            options={buildOptions(masters.m_models)}
          />
          <Select
            label="図面番号(品番)"
            value={partNumberId}
            onChange={(e) => {
              const newVal = e.target.value;
              const prevRow = masters.m_part_numbers.find((r) => r.id.toString() === partNumberId);
              const prevDefault = defaultLedgerDrawingFromPartMaster(prevRow);
              const newRow = masters.m_part_numbers.find((r) => r.id.toString() === newVal);
              const newDefault = defaultLedgerDrawingFromPartMaster(newRow);

              setPartNumberId(newVal);
              setDrawingNumber((cur) => {
                const t = cur.trim();
                if (t === "") return newDefault;
                if (partNumberId !== newVal && t === prevDefault.trim()) return newDefault;
                return cur;
              });
            }}
            options={buildOptions(masters.m_part_numbers)}
          />
          <Select
            label="部品名称"
            value={componentNameId}
            onChange={(e) => setComponentNameId(e.target.value)}
            options={buildOptions(masters.m_component_names)}
          />
          <div className="flex flex-col gap-1">
            <TextField
              label="図面番号（台帳）"
              value={drawingNumber}
              onChange={(e) => setDrawingNumber(e.target.value)}
            />
            <p className="text-xs text-fg-muted">
              未入力のときは図面番号(品番)マスタから自動入力されます。台帳だけ表記が違う場合はここで修正してください。
            </p>
          </div>
          <TextField
            label="Rev"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">備考</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
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
