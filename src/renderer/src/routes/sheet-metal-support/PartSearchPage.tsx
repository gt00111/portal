import { Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  DrawingFilePayload,
  PartDetail,
  PartSearchCascadeOptions,
  PartSearchResult,
  PartSummary,
} from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import { PdfJsViewer } from "@renderer/routes/drawing-library/PdfJsViewer.js";
import { JudgementPanel } from "@renderer/routes/sheet-metal-support/JudgementPanel.js";
import { ProcessConditionPanel } from "@renderer/routes/sheet-metal-support/ProcessConditionPanel.js";
import { SimulationPanel } from "@renderer/routes/sheet-metal-support/SimulationPanel.js";
import {
  ProcessHistoryPanel,
  RevisionHistoryPanel,
  TechnicalNotesPanel,
} from "@renderer/routes/sheet-metal-support/ProcessInfoPanels.js";

type DetailTab =
  | "detail"
  | "condition"
  | "judgement"
  | "note"
  | "history"
  | "revision"
  | "simulation";

const EMPTY_OPTION = { value: "", label: "すべて" } as const;

function toSelectOptions(values: string[]): ReadonlyArray<{ value: string; label: string }> {
  return [EMPTY_OPTION, ...values.map((v) => ({ value: v, label: v }))];
}

export function PartSearchPage({ writable }: { writable: boolean }): JSX.Element {
  const toast = useToast();

  const [options, setOptions] = useState<PartSearchCascadeOptions>({
    customers: [],
    models: [],
    partNumbers: [],
  });
  const [customer, setCustomer] = useState("");
  const [model, setModel] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [keyword, setKeyword] = useState("");

  const [result, setResult] = useState<PartSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<PartSummary | null>(null);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>("detail");

  const loadCascade = useCallback(
    async (nextCustomer: string, nextModel: string) => {
      try {
        const opts = await invoke<PartSearchCascadeOptions>("smsupport:searchCascadeOptions", {
          customerName: nextCustomer || null,
          model: nextModel || null,
        });
        setOptions(opts);
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      }
    },
    [toast]
  );

  const runSearch = useCallback(
    async (page = 1) => {
      setSearching(true);
      try {
        const res = await invoke<PartSearchResult>("smsupport:searchParts", {
          keyword: keyword || null,
          customerName: customer || null,
          model: model || null,
          partNumber: partNumber || null,
          page,
          pageSize: 20,
        });
        setResult(res);
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      } finally {
        setSearching(false);
      }
    },
    [keyword, customer, model, partNumber, toast]
  );

  useEffect(() => {
    void loadCascade("", "");
    void runSearch(1);
    // 初期ロードのみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCustomerChange(value: string): Promise<void> {
    setCustomer(value);
    setModel("");
    setPartNumber("");
    await loadCascade(value, "");
  }

  async function handleModelChange(value: string): Promise<void> {
    setModel(value);
    setPartNumber("");
    await loadCascade(customer, value);
  }

  const openDetail = useCallback(
    async (part: PartSummary) => {
      setSelected(part);
      setTab("detail");
      setDetail(null);
      setPdfDataUrl(null);
      setDetailLoading(true);
      try {
        const d = await invoke<PartDetail | null>("smsupport:getPartDetail", {
          partNumber: part.partNumber,
        });
        setDetail(d);
        if (d?.drawingId) {
          const file = await invoke<DrawingFilePayload>("smsupport:getDrawingFile", {
            drawingId: d.drawingId,
          });
          setPdfDataUrl(`data:${file.mime};base64,${file.base64}`);
        }
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  function clearSelection(): void {
    setSelected(null);
    setDetail(null);
    setPdfDataUrl(null);
  }

  const items = result?.items ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* 検索 + 一覧（入口） */}
      <section
        className={cn(
          "flex min-h-0 flex-col gap-3 lg:w-[380px] lg:shrink-0",
          selected && "hidden lg:flex"
        )}
      >
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-surface/80 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(1);
          }}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <Select
              label="客先"
              value={customer}
              options={toSelectOptions(options.customers)}
              onChange={(e) => void handleCustomerChange(e.target.value)}
            />
            <Select
              label="機種"
              value={model}
              options={toSelectOptions(options.models)}
              disabled={!customer}
              onChange={(e) => void handleModelChange(e.target.value)}
            />
            <Select
              label="図番（品番）"
              value={partNumber}
              options={toSelectOptions(options.partNumbers)}
              disabled={!model}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </div>
          <TextField
            label="キーワード"
            placeholder="品番・図番・客先名などで検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button type="submit" disabled={searching} className="w-full">
            <Search className="h-4 w-4" aria-hidden />
            <span>{searching ? "検索中..." : "検索"}</span>
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-surface/50">
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-xs text-fg-muted">
            <span>検索結果</span>
            <span>{result ? `${result.total} 件` : ""}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">
              {searching ? "読み込み中..." : "該当する図面がありません。"}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {items.map((item) => (
                <li key={item.drawingId ?? item.partNumber}>
                  <button
                    type="button"
                    onClick={() => void openDetail(item)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-bg-elevated",
                      selected?.drawingId === item.drawingId && "bg-accent-primary/10"
                    )}
                  >
                    <span className="truncate text-sm font-medium text-fg-primary">
                      {item.partNumber || "(品番なし)"}
                    </span>
                    <span className="truncate text-xs text-fg-muted">
                      {[item.customerName, item.model].filter(Boolean).join(" / ") || "—"}
                      {item.revision ? `　Rev ${item.revision}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 部品詳細（PDF 図面を最大表示） */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border-subtle bg-bg-surface/50">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-fg-muted">
            左の一覧から品番を選ぶと、最新版の図面を表示します。
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg-primary">
                  {selected.partNumber || "(品番なし)"}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {[selected.customerName, selected.model].filter(Boolean).join(" / ")}
                  {selected.revision ? `　Rev ${selected.revision}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="lg:hidden"
              >
                <X className="h-4 w-4" aria-hidden />
                <span>一覧へ</span>
              </Button>
            </header>

            <nav className="flex flex-wrap gap-1 border-b border-border-subtle px-2 pt-2">
              {(
                [
                  ["detail", "部品詳細"],
                  ["condition", "加工条件"],
                  ["judgement", "加工判定"],
                  ["note", "技術ノート"],
                  ["history", "加工履歴"],
                  ["revision", "更新履歴"],
                  ["simulation", "シミュレーション"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === id
                      ? "bg-accent-primary text-bg-base"
                      : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </nav>

            {tab === "detail" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <DetailField label="品番" value={detail?.partNumber} />
                  <DetailField label="図番" value={detail?.drawingNumber} />
                  <DetailField label="Rev" value={detail?.revision} />
                  <DetailField label="客先" value={detail?.customerName} />
                  <DetailField label="機種" value={detail?.model} />
                  <DetailField label="図面名" value={detail?.title} />
                </dl>
                <div className="min-h-0 flex-1">
                  {detailLoading ? (
                    <p className="py-8 text-center text-sm text-fg-muted">読み込み中...</p>
                  ) : (
                    <PdfJsViewer dataUrl={pdfDataUrl} fitToContainer />
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
                {tab === "condition" && (
                  <ProcessConditionPanel
                    key={`condition-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                    writable={writable}
                  />
                )}
                {tab === "judgement" && (
                  <JudgementPanel
                    key={`judgement-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                    writable={writable}
                  />
                )}
                {tab === "note" && (
                  <TechnicalNotesPanel
                    key={`note-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                    writable={writable}
                  />
                )}
                {tab === "history" && (
                  <ProcessHistoryPanel
                    key={`history-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                    writable={writable}
                  />
                )}
                {tab === "revision" && (
                  <RevisionHistoryPanel
                    key={`revision-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                  />
                )}
                {tab === "simulation" && (
                  <SimulationPanel
                    key={`simulation-${selected.partNumber}`}
                    partNumber={selected.partNumber}
                    writable={writable}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }): JSX.Element {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg-primary">{value || "—"}</dd>
    </div>
  );
}
