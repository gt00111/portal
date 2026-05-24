import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  PART_SOURCE_TYPES,
  PART_SOURCE_TYPE_LABELS,
  type PartSourceType,
} from "@shared/partsTracker.js";
import type { MasterRow } from "@shared/master.js";
import type {
  ProcurementLeadTimeRow,
  ProcurementLeadTimeUpsertInput,
} from "@shared/procurementLeadTime.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { useMasterContext } from "@renderer/routes/MasterDatabase.js";

const emptyForm = (): ProcurementLeadTimeUpsertInput => ({
  sourceType: "purchase",
  supplierId: null,
  skuId: null,
  partNumber: "",
  leadTimeDays: 7,
  note: "",
  isActive: true,
});

export function ProcurementLeadTimePage(): JSX.Element {
  const { canWrite } = useMasterContext();
  const toast = useToast();
  const [rows, setRows] = useState<ProcurementLeadTimeRow[]>([]);
  const [suppliers, setSuppliers] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProcurementLeadTimeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProcurementLeadTimeUpsertInput>(emptyForm());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ltList, supplierList] = await Promise.all([
        invoke<ProcurementLeadTimeRow[]>("master:procurementLeadTime:list"),
        invoke<MasterRow[]>("master:list", { table: "m_suppliers" }),
      ]);
      setRows(ltList);
      setSuppliers(supplierList.filter((s) => s.isActive));
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDelete(row: ProcurementLeadTimeRow): Promise<void> {
    if (!window.confirm("この標準リードタイムを削除します。よろしいですか？")) return;
    try {
      await invoke("master:procurementLeadTime:delete", { id: row.id });
      toast.push("success", "削除しました。");
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const columns = useMemo<Column<ProcurementLeadTimeRow>[]>(
    () => [
      {
        key: "sourceType",
        header: "区分",
        render: (r) => PART_SOURCE_TYPE_LABELS[r.sourceType],
      },
      { key: "supplierName", header: "商社", render: (r) => r.supplierName ?? "—" },
      { key: "partNumber", header: "品番", render: (r) => r.partNumber ?? "（共通）" },
      { key: "leadTimeDays", header: "LT（日）", render: (r) => String(r.leadTimeDays) },
      { key: "note", header: "備考", render: (r) => r.note ?? "" },
      {
        key: "isActive",
        header: "有効",
        render: (r) => (r.isActive ? "○" : "—"),
      },
      ...(canWrite
        ? [
            {
              key: "actions",
              header: "",
              align: "right" as const,
              render: (r: ProcurementLeadTimeRow) => (
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(r);
                      setForm({
                        sourceType: r.sourceType,
                        supplierId: r.supplierId,
                        skuId: r.skuId,
                        partNumber: r.partNumber ?? "",
                        leadTimeDays: r.leadTimeDays,
                        note: r.note ?? "",
                        isActive: r.isActive,
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(r)}
                  >
                    <Trash2 className="h-4 w-4 text-state-danger" />
                  </Button>
                </div>
              ),
            } as Column<ProcurementLeadTimeRow>,
          ]
        : []),
    ],
    [canWrite]
  );

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await invoke("master:procurementLeadTime:update", { id: editing.id, input: form });
        toast.push("success", "更新しました。");
      } else {
        await invoke("master:procurementLeadTime:create", form);
        toast.push("success", "登録しました。");
      }
      setEditing(null);
      setCreating(false);
      setForm(emptyForm());
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const modalOpen = creating || editing !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg-primary">標準リードタイム</h2>
          <p className="text-sm text-fg-muted">
            調達区分・商社・品番の組み合わせごとに、部材管理で自動提案するリードタイム（日）を登録します。
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(null);
              setForm(emptyForm());
            }}
          >
            <Plus className="h-4 w-4" />
            新規登録
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <p className="p-6 text-center text-fg-muted">読み込み中...</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(r) => r.id}
            empty="登録がありません。"
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? "標準 LT を編集" : "標準 LT を登録"}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <Select
            label="調達区分"
            value={form.sourceType}
            onChange={(e) =>
              setForm((f) => ({ ...f, sourceType: e.target.value as PartSourceType }))
            }
            options={PART_SOURCE_TYPES.map((t) => ({
              value: t,
              label: PART_SOURCE_TYPE_LABELS[t],
            }))}
          />
          {form.sourceType === "purchase" && (
            <Select
              label="商社"
              value={form.supplierId != null ? String(form.supplierId) : ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  supplierId: e.target.value ? Number(e.target.value) : null,
                }))
              }
              options={[
                { value: "", label: "（選択）" },
                ...suppliers.map((s) => ({ value: String(s.id), label: `${s.code} : ${s.name}` })),
              ]}
            />
          )}
          <TextField
            label="品番（空＝区分・商社共通）"
            value={form.partNumber ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))}
          />
          <TextField
            label="リードタイム（日）"
            type="number"
            min={0}
            value={String(form.leadTimeDays)}
            onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: Number(e.target.value) || 0 }))}
          />
          <TextField
            label="備考"
            value={form.note ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            有効
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
