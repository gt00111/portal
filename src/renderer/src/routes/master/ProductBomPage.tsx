import { ChevronRight, Copy, GitCompare, Layers, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { BomDiffResult } from "@shared/bomDiff.js";
import { BOM_DIFF_CHANGE_LABELS } from "@shared/bomDiff.js";
import type { MasterRow } from "@shared/master.js";
import {
  PART_SOURCE_TYPES,
  PART_SOURCE_TYPE_LABELS,
  type PartSourceType,
} from "@shared/partsTracker.js";
import {
  BOM_LINE_KINDS,
  BOM_LINE_KIND_LABELS,
  PRODUCT_BOM_STATUSES,
  PRODUCT_BOM_STATUS_LABELS,
  type BomLineKind,
  type ProductBomLineRow,
  type ProductBomLineUpsertInput,
  type ProductBomRow,
  type ProductBomStatus,
  type ProductRow,
  type ProductUpsertInput,
} from "@shared/productBom.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import { useMasterContext } from "@renderer/routes/MasterDatabase.js";

const emptyProductForm = (): ProductUpsertInput => ({
  partNumber: "",
  name: "",
  skuId: null,
  defaultSupplierId: null,
  note: "",
  isActive: true,
});

const emptyLineForm = (productBomId: number): ProductBomLineUpsertInput => ({
  productBomId,
  lineKind: "part",
  partNumber: "",
  partName: "",
  quantity: 1,
  sourceType: "purchase",
  supplierId: null,
  skuId: null,
  refProductBomId: null,
  refPartNumber: null,
  sortOrder: 0,
  note: "",
});

export function ProductBomPage(): JSX.Element {
  const { canWrite } = useMasterContext();
  const toast = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [boms, setBoms] = useState<ProductBomRow[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<number | null>(null);
  const [lines, setLines] = useState<ProductBomLineRow[]>([]);
  const [productQuery, setProductQuery] = useState("");

  // モーダル: 製品
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [productForm, setProductForm] = useState<ProductUpsertInput>(emptyProductForm());

  // モーダル: Rev
  const [bomOpen, setBomOpen] = useState(false);
  const [editingBom, setEditingBom] = useState<ProductBomRow | null>(null);
  const [bomRevision, setBomRevision] = useState("");
  const [bomNote, setBomNote] = useState("");
  const [bomStatus, setBomStatus] = useState<ProductBomStatus>("draft");

  // モーダル: BOM 行
  const [lineOpen, setLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ProductBomLineRow | null>(null);
  const [lineForm, setLineForm] = useState<ProductBomLineUpsertInput>(emptyLineForm(0));

  // Rev 差分モーダル
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffA, setDiffA] = useState<number | "">("");
  const [diffB, setDiffB] = useState<number | "">("");
  const [diffResult, setDiffResult] = useState<BomDiffResult | null>(null);

  const refreshProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [productList, supplierList] = await Promise.all([
        invoke<ProductRow[]>("master:productBom:listProducts"),
        invoke<MasterRow[]>("master:list", { table: "m_suppliers" }),
      ]);
      setProducts(productList);
      setSuppliers(supplierList.filter((s) => s.isActive));
      if (selectedProductId == null && productList.length > 0) {
        setSelectedProductId(productList[0].id);
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, toast]);

  const refreshBoms = useCallback(async () => {
    if (selectedProductId == null) {
      setBoms([]);
      setSelectedBomId(null);
      return;
    }
    try {
      const list = await invoke<ProductBomRow[]>("master:productBom:listBomsByProduct", {
        productId: selectedProductId,
      });
      setBoms(list);
      if (selectedBomId == null || !list.some((b) => b.id === selectedBomId)) {
        setSelectedBomId(list[0]?.id ?? null);
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }, [selectedProductId, selectedBomId, toast]);

  const refreshLines = useCallback(async () => {
    if (selectedBomId == null) {
      setLines([]);
      return;
    }
    try {
      const list = await invoke<ProductBomLineRow[]>("master:productBom:listLines", {
        productBomId: selectedBomId,
      });
      setLines(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }, [selectedBomId, toast]);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);
  useEffect(() => {
    void refreshBoms();
  }, [refreshBoms]);
  useEffect(() => {
    void refreshLines();
  }, [refreshLines]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.partNumber.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.note ?? "").toLowerCase().includes(q)
    );
  }, [products, productQuery]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );
  const selectedBom = useMemo(
    () => boms.find((b) => b.id === selectedBomId) ?? null,
    [boms, selectedBomId]
  );

  // -------- 製品 CRUD --------

  function openCreateProduct(): void {
    setProductOpen(true);
    setEditingProduct(null);
    setProductForm(emptyProductForm());
  }
  function openEditProduct(p: ProductRow): void {
    setProductOpen(true);
    setEditingProduct(p);
    setProductForm({
      partNumber: p.partNumber,
      name: p.name,
      skuId: p.skuId,
      defaultSupplierId: p.defaultSupplierId,
      note: p.note ?? "",
      isActive: p.isActive,
    });
  }
  async function handleSubmitProduct(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      if (editingProduct) {
        await invoke("master:productBom:updateProduct", {
          id: editingProduct.id,
          input: productForm,
        });
        toast.push("success", "製品を更新しました。");
      } else {
        await invoke("master:productBom:createProduct", productForm);
        toast.push("success", "製品を登録しました。");
      }
      setProductOpen(false);
      await refreshProducts();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }
  async function handleDeleteProduct(p: ProductRow): Promise<void> {
    if (!window.confirm(`「${p.partNumber} (${p.name})」を削除します。関連 Rev/BOM 行もすべて削除されます。`)) return;
    try {
      await invoke("master:productBom:deleteProduct", { id: p.id });
      toast.push("success", "削除しました。");
      if (selectedProductId === p.id) setSelectedProductId(null);
      await refreshProducts();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  // -------- Rev CRUD --------

  function openCreateBom(): void {
    if (!selectedProductId) {
      toast.push("error", "先に製品を選択してください。");
      return;
    }
    setBomOpen(true);
    setEditingBom(null);
    setBomRevision("");
    setBomNote("");
    setBomStatus("draft");
  }
  function openEditBom(b: ProductBomRow): void {
    setBomOpen(true);
    setEditingBom(b);
    setBomRevision(b.revision);
    setBomNote(b.note ?? "");
    setBomStatus(b.status);
  }
  async function handleSubmitBom(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!selectedProductId) return;
    try {
      if (editingBom) {
        await invoke("master:productBom:updateBom", {
          id: editingBom.id,
          input: {
            productId: selectedProductId,
            revision: bomRevision,
            note: bomNote || null,
            status: bomStatus,
          },
        });
      } else {
        await invoke("master:productBom:createBom", {
          productId: selectedProductId,
          revision: bomRevision,
          note: bomNote || null,
          status: bomStatus,
        });
      }
      toast.push("success", "Rev を保存しました。");
      setBomOpen(false);
      await refreshBoms();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }
  async function handleReleaseBom(b: ProductBomRow): Promise<void> {
    if (!window.confirm(`Rev ${b.revision} をリリースします。よろしいですか？`)) return;
    try {
      await invoke("master:productBom:releaseBom", { id: b.id });
      toast.push("success", "リリースしました。");
      await refreshBoms();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }
  async function handleCloneBom(b: ProductBomRow): Promise<void> {
    const newRev = window.prompt(`Rev ${b.revision} をコピーします。新 Rev 名を入力してください。`);
    if (!newRev) return;
    try {
      await invoke("master:productBom:cloneBom", { sourceId: b.id, newRevision: newRev });
      toast.push("success", `Rev ${newRev} を作成しました。`);
      await refreshBoms();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }
  async function handleDeleteBom(b: ProductBomRow): Promise<void> {
    if (!window.confirm(`Rev ${b.revision} を削除します。BOM 構成行も削除されます。`)) return;
    try {
      await invoke("master:productBom:deleteBom", { id: b.id });
      toast.push("success", "削除しました。");
      if (selectedBomId === b.id) setSelectedBomId(null);
      await refreshBoms();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  // -------- BOM 行 CRUD --------

  function openCreateLine(): void {
    if (!selectedBomId) {
      toast.push("error", "先に Rev を選択してください。");
      return;
    }
    setLineOpen(true);
    setEditingLine(null);
    setLineForm({ ...emptyLineForm(selectedBomId), sortOrder: (lines.length + 1) * 10 });
  }
  function openEditLine(l: ProductBomLineRow): void {
    setLineOpen(true);
    setEditingLine(l);
    setLineForm({
      productBomId: l.productBomId,
      lineKind: l.lineKind,
      partNumber: l.partNumber,
      partName: l.partName,
      quantity: l.quantity,
      sourceType: l.sourceType,
      supplierId: l.supplierId,
      skuId: l.skuId,
      refProductBomId: l.refProductBomId,
      refPartNumber: l.refPartNumber,
      sortOrder: l.sortOrder,
      note: l.note ?? "",
    });
  }
  async function handleSubmitLine(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      if (editingLine) {
        await invoke("master:productBom:updateLine", {
          id: editingLine.id,
          input: lineForm,
        });
      } else {
        await invoke("master:productBom:createLine", lineForm);
      }
      toast.push("success", "BOM 行を保存しました。");
      setLineOpen(false);
      await refreshLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }
  async function handleDeleteLine(l: ProductBomLineRow): Promise<void> {
    if (!window.confirm(`「${l.partNumber}」を削除します。`)) return;
    try {
      await invoke("master:productBom:deleteLine", { id: l.id });
      toast.push("success", "削除しました。");
      await refreshLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  // -------- Rev 差分 --------

  async function handleRunDiff(): Promise<void> {
    if (!diffA || !diffB || diffA === diffB) {
      toast.push("error", "比較する 2 つの Rev を選択してください。");
      return;
    }
    try {
      const res = await invoke<BomDiffResult>("parts-tracker:bomDiff:productRev", {
        productBomIdA: Number(diffA),
        productBomIdB: Number(diffB),
      });
      setDiffResult(res);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const productColumns = useMemo<Array<Column<ProductRow>>>(() => {
    const base: Array<Column<ProductRow>> = [
      {
        key: "partNumber",
        header: "親番",
        width: "140px",
        render: (p) => <span className="font-mono text-xs">{p.partNumber}</span>,
      },
      { key: "name", header: "名称", render: (p) => p.name },
      {
        key: "supplier",
        header: "標準商社",
        width: "120px",
        render: (p) => p.defaultSupplierName ?? "—",
      },
      {
        key: "bom",
        header: "Rev",
        width: "100px",
        render: (p) => (
          <span className="text-xs">
            {p.bomCount} 件{p.latestRevision ? ` / 最新 ${p.latestRevision}` : ""}
          </span>
        ),
      },
      {
        key: "active",
        header: "状態",
        width: "60px",
        render: (p) =>
          p.isActive ? (
            <span className="text-state-success text-xs">有効</span>
          ) : (
            <span className="text-fg-subtle text-xs">無効</span>
          ),
      },
    ];
    if (canWrite) {
      base.push({
        key: "actions",
        header: "",
        width: "88px",
        align: "right",
        render: (p) => (
          <div className="flex justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openEditProduct(p);
              }}
            >
              <Pencil size={14} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleDeleteProduct(p);
              }}
            >
              <Trash2 size={14} className="text-state-danger" aria-hidden />
            </Button>
          </div>
        ),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  const lineColumns = useMemo<Array<Column<ProductBomLineRow>>>(() => {
    const base: Array<Column<ProductBomLineRow>> = [
      {
        key: "kind",
        header: "種別",
        width: "100px",
        render: (l) => (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px]",
              l.lineKind === "sub_assembly"
                ? "bg-accent-secondary/15 text-accent-secondary"
                : "bg-bg-elevated text-fg-muted"
            )}
          >
            {BOM_LINE_KIND_LABELS[l.lineKind]}
          </span>
        ),
      },
      {
        key: "partNumber",
        header: "品番",
        width: "120px",
        render: (l) => <span className="font-mono text-xs">{l.partNumber}</span>,
      },
      { key: "name", header: "名称", render: (l) => l.partName },
      {
        key: "quantity",
        header: "員数",
        width: "60px",
        align: "right",
        render: (l) => l.quantity,
      },
      {
        key: "source",
        header: "区分",
        width: "70px",
        render: (l) => PART_SOURCE_TYPE_LABELS[l.sourceType],
      },
      {
        key: "supplier",
        header: "商社",
        width: "100px",
        render: (l) => l.supplierName ?? "—",
      },
      {
        key: "ref",
        header: "参照 BOM",
        render: (l) =>
          l.lineKind === "sub_assembly" ? (
            <span className="text-xs text-fg-muted">{l.refSummary ?? "（自動解決）"}</span>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
    ];
    if (canWrite) {
      base.push({
        key: "actions",
        header: "",
        width: "88px",
        align: "right",
        render: (l) => (
          <div className="flex justify-end gap-0.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => openEditLine(l)}>
              <Pencil size={14} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDeleteLine(l)}
            >
              <Trash2 size={14} className="text-state-danger" aria-hidden />
            </Button>
          </div>
        ),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-medium">
            <Layers size={18} className="text-accent-secondary" aria-hidden />
            製品マスタ（親番テンプレート）
          </div>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="親番・名称で検索"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              className="h-9 w-56 rounded-md border border-border-strong bg-bg-surface px-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            />
            {canWrite && (
              <Button type="button" size="sm" onClick={openCreateProduct}>
                <Plus size={14} aria-hidden />
                製品を追加
              </Button>
            )}
          </div>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-fg-muted">読み込み中...</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-border-subtle">
            <DataTable
              columns={productColumns}
              rows={filteredProducts}
              keyOf={(p) => p.id}
              onRowClick={(p) => setSelectedProductId(p.id)}
              rowClassName={(p) =>
                p.id === selectedProductId ? "bg-accent-primary/5" : undefined
              }
            />
          </div>
        )}
      </Card>

      {selectedProduct && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <ChevronRight size={16} className="text-fg-subtle" aria-hidden />
              <span className="font-mono text-xs">{selectedProduct.partNumber}</span>
              <span className="text-fg-muted">{selectedProduct.name}</span>
            </div>
            <div className="flex gap-2">
              {boms.length >= 2 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDiffOpen(true)}
                >
                  <GitCompare size={14} aria-hidden />
                  Rev 差分
                </Button>
              )}
              {canWrite && (
                <Button type="button" size="sm" onClick={openCreateBom}>
                  <Plus size={14} aria-hidden />
                  Rev を追加
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {boms.length === 0 && (
              <p className="text-xs text-fg-muted">Rev がまだありません。</p>
            )}
            {boms.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBomId(b.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs",
                  selectedBomId === b.id
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-subtle bg-bg-surface hover:border-accent-primary/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono">Rev {b.revision}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      b.status === "released" && "bg-state-success/15 text-state-success",
                      b.status === "draft" && "bg-bg-elevated text-fg-muted",
                      b.status === "obsolete" && "bg-state-danger/15 text-state-danger"
                    )}
                  >
                    {PRODUCT_BOM_STATUS_LABELS[b.status]}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-fg-subtle">{b.lineCount} 行</div>
              </button>
            ))}
          </div>

          {selectedBom && (
            <div className="space-y-2 border-t border-border-subtle pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-fg-muted">
                  Rev {selectedBom.revision} ・ {selectedBom.lineCount} 行
                  {selectedBom.releasedAt && (
                    <span className="ml-2 text-state-success">
                      リリース: {selectedBom.releasedAt.slice(0, 16)} by {selectedBom.releasedByUsername ?? "—"}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {canWrite && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditBom(selectedBom)}
                      >
                        <Pencil size={14} aria-hidden />
                        Rev 編集
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleCloneBom(selectedBom)}
                      >
                        <Copy size={14} aria-hidden />
                        コピー
                      </Button>
                      {selectedBom.status !== "released" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleReleaseBom(selectedBom)}
                        >
                          <Send size={14} aria-hidden />
                          リリース
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteBom(selectedBom)}
                      >
                        <Trash2 size={14} className="text-state-danger" aria-hidden />
                      </Button>
                      <Button type="button" size="sm" onClick={openCreateLine}>
                        <Plus size={14} aria-hidden />
                        BOM 行を追加
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-border-subtle">
                <DataTable columns={lineColumns} rows={lines} keyOf={(l) => l.id} />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 製品モーダル */}
      <Modal
        open={productOpen}
        title={editingProduct ? "製品を編集" : "製品を追加"}
        onClose={() => setProductOpen(false)}
      >
        <form className="space-y-3" onSubmit={(e) => void handleSubmitProduct(e)}>
          <TextField
            label="親番（品番）"
            value={productForm.partNumber}
            onChange={(e) =>
              setProductForm((f) => ({ ...f, partNumber: e.target.value }))
            }
            required
          />
          <TextField
            label="製品名称"
            value={productForm.name}
            onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Select
            label="標準商社（任意）"
            value={productForm.defaultSupplierId != null ? String(productForm.defaultSupplierId) : ""}
            onChange={(e) =>
              setProductForm((f) => ({
                ...f,
                defaultSupplierId: e.target.value ? Number(e.target.value) : null,
              }))
            }
            options={[
              { value: "", label: "（指定なし）" },
              ...suppliers.map((s) => ({ value: String(s.id), label: `${s.code} : ${s.name}` })),
            ]}
          />
          <TextField
            label="備考"
            value={productForm.note ?? ""}
            onChange={(e) => setProductForm((f) => ({ ...f, note: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={productForm.isActive !== false}
              onChange={(e) => setProductForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            有効
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setProductOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>

      {/* Rev モーダル */}
      <Modal
        open={bomOpen}
        title={editingBom ? "Rev を編集" : "Rev を追加"}
        onClose={() => setBomOpen(false)}
      >
        <form className="space-y-3" onSubmit={(e) => void handleSubmitBom(e)}>
          <TextField
            label="Rev"
            value={bomRevision}
            onChange={(e) => setBomRevision(e.target.value)}
            placeholder="A / 01 / R2 等"
            required
          />
          <Select
            label="ステータス"
            value={bomStatus}
            onChange={(e) => setBomStatus(e.target.value as ProductBomStatus)}
            options={PRODUCT_BOM_STATUSES.map((s) => ({
              value: s,
              label: PRODUCT_BOM_STATUS_LABELS[s],
            }))}
          />
          <TextField
            label="変更点メモ（任意）"
            value={bomNote}
            onChange={(e) => setBomNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBomOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>

      {/* BOM 行モーダル */}
      <Modal
        open={lineOpen}
        title={editingLine ? "BOM 行を編集" : "BOM 行を追加"}
        onClose={() => setLineOpen(false)}
        width="lg"
      >
        <form className="space-y-3" onSubmit={(e) => void handleSubmitLine(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="行種別"
              value={lineForm.lineKind}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, lineKind: e.target.value as BomLineKind }))
              }
              options={BOM_LINE_KINDS.map((k) => ({ value: k, label: BOM_LINE_KIND_LABELS[k] }))}
            />
            <TextField
              label="員数"
              type="number"
              min={0}
              step="any"
              value={String(lineForm.quantity ?? 1)}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))
              }
            />
            <TextField
              label="品番"
              value={lineForm.partNumber}
              onChange={(e) => setLineForm((f) => ({ ...f, partNumber: e.target.value }))}
              required
            />
            <TextField
              label="名称"
              value={lineForm.partName}
              onChange={(e) => setLineForm((f) => ({ ...f, partName: e.target.value }))}
              required
            />
            <Select
              label="調達区分"
              value={lineForm.sourceType}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, sourceType: e.target.value as PartSourceType }))
              }
              options={PART_SOURCE_TYPES.map((t) => ({
                value: t,
                label: PART_SOURCE_TYPE_LABELS[t],
              }))}
            />
            <Select
              label="商社（任意）"
              value={lineForm.supplierId != null ? String(lineForm.supplierId) : ""}
              onChange={(e) =>
                setLineForm((f) => ({
                  ...f,
                  supplierId: e.target.value ? Number(e.target.value) : null,
                }))
              }
              options={[
                { value: "", label: "（指定なし）" },
                ...suppliers.map((s) => ({ value: String(s.id), label: `${s.code} : ${s.name}` })),
              ]}
            />
            {lineForm.lineKind === "sub_assembly" && (
              <div className="sm:col-span-2">
                <TextField
                  label="参照する子の品番（任意）"
                  value={lineForm.refPartNumber ?? ""}
                  onChange={(e) =>
                    setLineForm((f) => ({
                      ...f,
                      refPartNumber: e.target.value.trim() || null,
                    }))
                  }
                  placeholder="未指定なら品番から自動解決"
                />
              </div>
            )}
            <TextField
              label="表示順"
              type="number"
              value={String(lineForm.sortOrder ?? 0)}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
              }
            />
            <TextField
              label="備考"
              value={lineForm.note ?? ""}
              onChange={(e) => setLineForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLineOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>

      {/* Rev 差分 */}
      <Modal
        open={diffOpen}
        title={`${selectedProduct?.partNumber ?? ""} の Rev 差分`}
        onClose={() => setDiffOpen(false)}
        width="xl"
      >
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Rev A"
              value={diffA === "" ? "" : String(diffA)}
              onChange={(e) => setDiffA(e.target.value === "" ? "" : Number(e.target.value))}
              options={[
                { value: "", label: "（選択）" },
                ...boms.map((b) => ({ value: String(b.id), label: `Rev ${b.revision}` })),
              ]}
            />
            <Select
              label="Rev B"
              value={diffB === "" ? "" : String(diffB)}
              onChange={(e) => setDiffB(e.target.value === "" ? "" : Number(e.target.value))}
              options={[
                { value: "", label: "（選択）" },
                ...boms.map((b) => ({ value: String(b.id), label: `Rev ${b.revision}` })),
              ]}
            />
            <Button type="button" onClick={() => void handleRunDiff()}>
              比較する
            </Button>
          </div>
          {diffResult && (
            <>
              <div className="rounded-md bg-bg-elevated/50 px-3 py-2 text-xs">
                <p className="font-medium">{diffResult.summaryText}</p>
              </div>
              <div className="max-h-96 overflow-auto rounded-md border border-border-subtle">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-elevated text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">区分</th>
                      <th className="px-2 py-1 text-left">品番</th>
                      <th className="px-2 py-1 text-left">名称</th>
                      <th className="px-2 py-1 text-right">A 数量</th>
                      <th className="px-2 py-1 text-right">B 数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffResult.entries.map((e) => (
                      <tr
                        key={e.matchKey}
                        className={cn(
                          "border-t border-border-subtle",
                          e.kind === "added" && "bg-state-success/5",
                          e.kind === "removed" && "bg-state-danger/5",
                          e.kind === "quantityChanged" && "bg-amber-500/5"
                        )}
                      >
                        <td className="px-2 py-1 text-fg-muted">
                          {BOM_DIFF_CHANGE_LABELS[e.kind]}
                        </td>
                        <td className="px-2 py-1 font-mono">{e.partNumber}</td>
                        <td className="px-2 py-1">{e.partName}</td>
                        <td className="px-2 py-1 text-right">{e.a?.quantity ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{e.b?.quantity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
