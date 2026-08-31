import { Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  ApplyAutoSelectResult,
  MachineOption,
  ProcessCondition,
  ProcessConditionInput,
  ToolHolderOption,
  ToolOption,
  ToolStackSide,
} from "@shared/sheetMetalSupport.js";
import {
  HOLDER_TYPE_LABELS,
  HOLDER_TYPE_SIDES,
  isToolUsableOnMachine,
  TOOL_STACK_SIDE_LABELS,
} from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg-primary placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-60";
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-60";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface BendRow {
  key: string;
  detectedBendIndex: string;
  upperToolId: string;
  lowerToolId: string;
  machineId: string;
  backGauge: string;
  angle: string;
  bendRadius: string;
  note: string;
}

let bendKeySeq = 0;
function newBendRow(): BendRow {
  bendKeySeq += 1;
  return {
    key: `bend-${bendKeySeq}`,
    detectedBendIndex: "",
    upperToolId: "",
    lowerToolId: "",
    machineId: "",
    backGauge: "",
    angle: "",
    bendRadius: "",
    note: "",
  };
}

function numOrNull(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function idOrNull(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface StackRow {
  key: string;
  holderId: string;
}

let stackKeySeq = 0;
function newStackRow(holderId = ""): StackRow {
  stackKeySeq += 1;
  return { key: `stack-${stackKeySeq}`, holderId };
}

export function ProcessConditionPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSelectBusy, setAutoSelectBusy] = useState(false);

  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [upperTools, setUpperTools] = useState<ToolOption[]>([]);
  const [lowerTools, setLowerTools] = useState<ToolOption[]>([]);
  const [holders, setHolders] = useState<ToolHolderOption[]>([]);

  const [material, setMaterial] = useState("");
  const [thickness, setThickness] = useState("");
  const [workDirection, setWorkDirection] = useState("");
  const [processScore, setProcessScore] = useState("");
  const [note, setNote] = useState("");
  const [bends, setBends] = useState<BendRow[]>([]);
  const [upperStack, setUpperStack] = useState<StackRow[]>([]);
  const [lowerStack, setLowerStack] = useState<StackRow[]>([]);
  const [meta, setMeta] = useState<{ updatedByName: string | null; updatedAt: string } | null>(
    null
  );

  const applyCondition = useCallback((c: ProcessCondition | null) => {
    setMaterial(c?.material ?? "");
    setThickness(c?.thickness != null ? String(c.thickness) : "");
    setWorkDirection(c?.workDirection ?? "");
    setProcessScore(c?.processScore != null ? String(c.processScore) : "");
    setNote(c?.note ?? "");
    setMeta(c ? { updatedByName: c.updatedByName, updatedAt: c.updatedAt } : null);
    setBends(
      (c?.bends ?? []).map((b) => {
        bendKeySeq += 1;
        return {
          key: `bend-${bendKeySeq}`,
          detectedBendIndex:
            b.detectedBendIndex != null ? String(b.detectedBendIndex) : "",
          upperToolId: b.upperToolId != null ? String(b.upperToolId) : "",
          lowerToolId: b.lowerToolId != null ? String(b.lowerToolId) : "",
          machineId: b.machineId != null ? String(b.machineId) : "",
          backGauge: b.backGauge != null ? String(b.backGauge) : "",
          angle: b.angle != null ? String(b.angle) : "",
          bendRadius: b.bendRadius != null ? String(b.bendRadius) : "",
          note: b.note ?? "",
        };
      })
    );
    setUpperStack((c?.stack.upper ?? []).map((item) => newStackRow(String(item.holderId))));
    setLowerStack((c?.stack.lower ?? []).map((item) => newStackRow(String(item.holderId))));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [condition, tools, machineList] = await Promise.all([
        invoke<ProcessCondition | null>("smsupport:processCondition:getByPart", { partNumber }),
        invoke<{ upper: ToolOption[]; lower: ToolOption[]; holders: ToolHolderOption[] }>(
          "smsupport:listTools",
          {}
        ),
        invoke<MachineOption[]>("smsupport:listMachines", {}),
      ]);
      setUpperTools(tools.upper);
      setLowerTools(tools.lower);
      setHolders(tools.holders ?? []);
      setMachines(machineList);
      applyCondition(condition);
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [partNumber, applyCondition, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateBend(key: string, patch: Partial<BendRow>): void {
    setBends((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function removeBend(key: string): void {
    setBends((prev) => prev.filter((b) => b.key !== key));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const input: ProcessConditionInput = {
        partNumber,
        material: material.trim() || null,
        thickness: numOrNull(thickness),
        processScore: numOrNull(processScore),
        workDirection: workDirection.trim() || null,
        note: note.trim() || null,
        bends: bends.map((b, index) => ({
          bendSequence: index + 1,
          detectedBendIndex: idOrNull(b.detectedBendIndex),
          upperToolId: idOrNull(b.upperToolId),
          lowerToolId: idOrNull(b.lowerToolId),
          machineId: idOrNull(b.machineId),
          backGauge: numOrNull(b.backGauge),
          angle: numOrNull(b.angle),
          bendRadius: numOrNull(b.bendRadius),
          note: b.note.trim() || null,
        })),
        stack: {
          upper: upperStack.map((row) => idOrNull(row.holderId)).filter((id): id is number => id != null),
          lower: lowerStack.map((row) => idOrNull(row.holderId)).filter((id): id is number => id != null),
        },
      };
      const saved = await invoke<ProcessCondition>("smsupport:processCondition:save", input);
      applyCondition(saved);
      toast.push("success", "加工条件を保存しました。");
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoSelect(): Promise<void> {
    if (
      !window.confirm(
        "形状解析と推奨曲げ順から、板厚・曲げ順・金型・スタックを自動選定して上書きします。よろしいですか？"
      )
    ) {
      return;
    }
    setAutoSelectBusy(true);
    try {
      const result = await invoke<ApplyAutoSelectResult>("smsupport:processCondition:applyAutoSelect", {
        partNumber,
        preserveMaterial: Boolean(material.trim()),
      });
      applyCondition(result.condition);
      if (result.preview.warnings.length > 0) {
        toast.push("info", result.preview.warnings.join(" "));
      } else {
        toast.push("success", "加工条件を自動選定しました。");
      }
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setAutoSelectBusy(false);
    }
  }

  if (loading) {
    return <p className="py-4 text-center text-sm text-fg-muted">読み込み中...</p>;
  }

  /**
   * 金型の選択肢。機械を選んでいる場合はその機械に付く金型だけを出す。
   * すでに選ばれている金型は、機械に付かなくても選択肢から消さず注記を付ける
   * （消すと保存済みの内容が黙って書き換わってしまうため）。
   */
  const toolOptions = (list: ToolOption[], machineId: string, selectedId: string): JSX.Element[] => {
    const machine = idOrNull(machineId);
    const usable = list.filter(
      (t) => isToolUsableOnMachine(t, machine) || String(t.id) === selectedId
    );
    return [
      <option key="" value="">
        —
      </option>,
      ...usable.map((t) => (
        <option key={t.id} value={String(t.id)}>
          {t.name}
          {machine != null && !isToolUsableOnMachine(t, machine) ? "（この機械には付きません）" : ""}
        </option>
      )),
    ];
  };

  const selectedMachineIds = [
    ...new Set(bends.map((b) => idOrNull(b.machineId)).filter((id): id is number => id != null)),
  ];

  return (
    <div className="flex flex-col gap-4">
      {writable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={autoSelectBusy}
            onClick={() => void handleAutoSelect()}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            <span>{autoSelectBusy ? "選定中…" : "形状から自動選定"}</span>
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          材質
          <input
            className={INPUT_CLASS}
            value={material}
            disabled={!writable}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="SPCC 等"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          板厚(mm)
          <input
            className={INPUT_CLASS}
            type="number"
            step="0.1"
            value={thickness}
            disabled={!writable}
            onChange={(e) => setThickness(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          ワーク向き
          <input
            className={INPUT_CLASS}
            value={workDirection}
            disabled={!writable}
            onChange={(e) => setWorkDirection(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          加工性評価(0-100)
          <input
            className={INPUT_CLASS}
            type="number"
            min="0"
            max="100"
            value={processScore}
            disabled={!writable}
            onChange={(e) => setProcessScore(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        注意事項
        <textarea
          className="min-h-[56px] w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-60"
          value={note}
          disabled={!writable}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg-primary">金型スタック（品番共通）</span>
        <p className="text-[11px] text-fg-subtle">
          上型・下型は曲げごとに選び、ホルダーと中間板はこの品番で共通です。並びは機械側から順です。同じホルダーを複数段積むこともできます。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StackSideEditor
            side="upper"
            rows={upperStack}
            holders={holders}
            machineIds={selectedMachineIds}
            writable={writable}
            onChange={setUpperStack}
          />
          <StackSideEditor
            side="lower"
            rows={lowerStack}
            holders={holders}
            machineIds={selectedMachineIds}
            writable={writable}
            onChange={setLowerStack}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-primary">曲げ順</span>
          {writable && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setBends((p) => [...p, newBendRow()])}>
              <Plus className="h-4 w-4" aria-hidden />
              <span>曲げ追加</span>
            </Button>
          )}
        </div>

        {bends.length === 0 ? (
          <p className="rounded-lg border border-border-subtle bg-bg-surface/50 py-3 text-center text-xs text-fg-muted">
            曲げ順は未登録です。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {bends.map((b, index) => (
              <div
                key={b.key}
                className="rounded-xl border border-border-subtle bg-bg-surface/50 p-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-md bg-accent-primary/15 px-2 py-0.5 text-xs font-semibold text-accent-primary">
                    曲げ {index + 1}
                  </span>
                  {writable && (
                    <button
                      type="button"
                      onClick={() => removeBend(b.key)}
                      title="この曲げを削除"
                      className="rounded p-1 text-fg-muted hover:bg-state-danger/15 hover:text-state-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    上型
                    <select
                      className={SELECT_CLASS}
                      value={b.upperToolId}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { upperToolId: e.target.value })}
                    >
                      {toolOptions(upperTools, b.machineId, b.upperToolId)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    下型
                    <select
                      className={SELECT_CLASS}
                      value={b.lowerToolId}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { lowerToolId: e.target.value })}
                    >
                      {toolOptions(lowerTools, b.machineId, b.lowerToolId)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    機械
                    <select
                      className={SELECT_CLASS}
                      value={b.machineId}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { machineId: e.target.value })}
                    >
                      <option value="">—</option>
                      {machines.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    バックゲージ(mm)
                    <input
                      className={INPUT_CLASS}
                      type="number"
                      step="0.1"
                      value={b.backGauge}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { backGauge: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    角度(°)
                    <input
                      className={INPUT_CLASS}
                      type="number"
                      step="0.1"
                      value={b.angle}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { angle: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
                    曲げR(mm)
                    <input
                      className={INPUT_CLASS}
                      type="number"
                      step="0.1"
                      value={b.bendRadius}
                      disabled={!writable}
                      onChange={(e) => updateBend(b.key, { bendRadius: e.target.value })}
                    />
                  </label>
                </div>
                <label className="mt-2 flex flex-col gap-1 text-[11px] text-fg-muted">
                  メモ
                  <input
                    className={INPUT_CLASS}
                    value={b.note}
                    disabled={!writable}
                    onChange={(e) => updateBend(b.key, { note: e.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {writable && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-fg-subtle">
            {meta ? `最終更新 ${meta.updatedByName ? `${meta.updatedByName} ・ ` : ""}${meta.updatedAt}` : "未登録"}
          </span>
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            <Save className="h-4 w-4" aria-hidden />
            <span>加工条件を保存</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function holderFitsSide(holder: ToolHolderOption, side: ToolStackSide): boolean {
  if (holder.holderType == null) return true;
  return HOLDER_TYPE_SIDES[holder.holderType] === side;
}

function stackHeightMm(rows: StackRow[], holders: ToolHolderOption[]): number | null {
  let sum = 0;
  for (const row of rows) {
    const id = idOrNull(row.holderId);
    if (id == null) continue;
    const holder = holders.find((h) => h.id === id);
    if (holder?.toolHeight == null) return null;
    sum += holder.toolHeight;
  }
  return sum;
}

function StackSideEditor({
  side,
  rows,
  holders,
  machineIds,
  writable,
  onChange,
}: {
  side: ToolStackSide;
  rows: StackRow[];
  holders: ToolHolderOption[];
  machineIds: number[];
  writable: boolean;
  onChange: (rows: StackRow[]) => void;
}): JSX.Element {
  const from = side === "upper" ? "ラム" : "テーブル";
  const to = side === "upper" ? "パンチ" : "ダイ";
  const height = stackHeightMm(rows, holders);

  function options(selectedId: string): JSX.Element[] {
    const usable = holders.filter(
      (h) =>
        String(h.id) === selectedId ||
        (holderFitsSide(h, side) &&
          (machineIds.length === 0 || machineIds.every((id) => isToolUsableOnMachine(h, id))))
    );
    return [
      <option key="" value="">
        —
      </option>,
      ...usable.map((h) => {
        const unusable =
          machineIds.length > 0 && machineIds.some((id) => !isToolUsableOnMachine(h, id));
        const typeNote =
          h.holderType == null
            ? "種別未登録"
            : !holderFitsSide(h, side)
              ? HOLDER_TYPE_LABELS[h.holderType]
              : null;
        const extra = [h.toolHeight != null ? `${h.toolHeight}mm` : null, typeNote, unusable ? "この機械には付きません" : null]
          .filter(Boolean)
          .join("・");
        return (
          <option key={h.id} value={String(h.id)}>
            {h.name}
            {extra ? `（${extra}）` : ""}
          </option>
        );
      }),
    ];
  }

  function updateRow(key: string, holderId: string): void {
    onChange(rows.map((row) => (row.key === key ? { ...row, holderId } : row)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-surface/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-primary">{TOOL_STACK_SIDE_LABELS[side]}</span>
        {height != null && height > 0 && (
          <span className="text-[11px] tabular-nums text-fg-subtle">合計 {height}mm</span>
        )}
      </div>
      <p className="text-[11px] text-fg-subtle">
        {from} → 下の順に積む → {to}
      </p>
      {holders.length === 0 && (
        <p className="text-[11px] text-fg-muted">
          ホルダー・中間板マスタが未登録です。マスターデータベースから登録してください。
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-[11px] text-fg-muted">未登録（{from}に{to}を直接取り付け）</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, index) => (
            <li key={row.key} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-fg-subtle">
                {index + 1}
              </span>
              <select
                className={SELECT_CLASS}
                value={row.holderId}
                disabled={!writable}
                onChange={(e) => updateRow(row.key, e.target.value)}
              >
                {options(row.holderId)}
              </select>
              {writable && (
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  title="この段を削除"
                  className="rounded p-1 text-fg-muted hover:bg-state-danger/15 hover:text-state-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {writable && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...rows, newStackRow()])}>
          <Plus className="h-4 w-4" aria-hidden />
          <span>段を追加</span>
        </Button>
      )}
    </div>
  );
}
