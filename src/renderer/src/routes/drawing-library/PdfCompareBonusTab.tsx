import { Download, HelpCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CompareDrawingsResult } from "@shared/drawingLibrary.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import {
  DrawingLibraryHelpContent,
  drawingLibraryHelpTitle,
} from "@renderer/routes/drawing-library/DrawingLibraryHelpContent.js";

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

/** おまけ: 外部 PDF 2 件を compare_drawings で差分表示 */
export function PdfCompareBonusTab(): JSX.Element {
  const toast = useToast();
  const [comparePathA, setComparePathA] = useState<string | null>(null);
  const [comparePathB, setComparePathB] = useState<string | null>(null);
  const [pageCountA, setPageCountA] = useState<number | null>(null);
  const [pageCountB, setPageCountB] = useState<number | null>(null);
  const [pageCountLoading, setPageCountLoading] = useState(false);
  const [comparePage, setComparePage] = useState(1);
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareOutput, setCompareOutput] = useState<CompareDrawingsResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const maxComparePage = useMemo(() => {
    const counts: number[] = [];
    if (pageCountA != null) counts.push(pageCountA);
    if (pageCountB != null) counts.push(pageCountB);
    if (counts.length === 0) return null;
    return Math.min(...counts);
  }, [pageCountA, pageCountB]);

  const refreshPageCounts = useCallback(
    async (pathA: string | null, pathB: string | null): Promise<void> => {
      setPageCountLoading(true);
      try {
        let nextA: number | null = null;
        let nextB: number | null = null;
        if (pathA) {
          const { pageCount } = await invoke<{ pageCount: number }>("drawing-library:getPdfPageCount", {
            path: pathA,
          });
          nextA = pageCount;
        }
        if (pathB) {
          const { pageCount } = await invoke<{ pageCount: number }>("drawing-library:getPdfPageCount", {
            path: pathB,
          });
          nextB = pageCount;
        }
        setPageCountA(nextA);
        setPageCountB(nextB);
        const max =
          nextA != null && nextB != null
            ? Math.min(nextA, nextB)
            : nextA != null
              ? nextA
              : nextB != null
                ? nextB
                : null;
        setComparePage((prev) => {
          if (max == null) return 1;
          return Math.min(Math.max(1, prev), max);
        });
      } catch (err) {
        setPageCountA(null);
        setPageCountB(null);
        toast.push("error", err instanceof Error ? err.message : String(err));
      } finally {
        setPageCountLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void refreshPageCounts(comparePathA, comparePathB);
  }, [comparePathA, comparePathB, refreshPageCounts]);

  async function pickCompareFile(which: "a" | "b"): Promise<void> {
    try {
      const { path } = await invoke<{ path: string }>("drawing-library:pickPdfForCompare", {});
      setCompareOutput(null);
      if (which === "a") setComparePathA(path);
      else setComparePathB(path);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function clearCompareFile(which: "a" | "b"): void {
    setCompareOutput(null);
    if (which === "a") {
      setComparePathA(null);
      setPageCountA(null);
    } else {
      setComparePathB(null);
      setPageCountB(null);
    }
  }

  async function runCompare(): Promise<void> {
    if (!comparePathA || !comparePathB) {
      toast.push("warning", "比較する PDF を2つとも選んでください。");
      return;
    }
    if (comparePathA === comparePathB) {
      toast.push("warning", "同じファイル同士は比較できません。");
      return;
    }
    if (maxComparePage == null) {
      toast.push("warning", "PDF のページ数を読み取れていません。ファイルを選び直してください。");
      return;
    }
    const pageNum = Math.trunc(comparePage);
    if (!Number.isFinite(pageNum) || pageNum < 1 || pageNum > maxComparePage) {
      toast.push("warning", `比較ページは 1〜${maxComparePage} の範囲で指定してください。`);
      return;
    }
    setCompareRunning(true);
    setCompareOutput(null);
    try {
      const out = await invoke<CompareDrawingsResult>("drawing-library:compare", {
        filePath1: comparePathA,
        filePath2: comparePathB,
        pageNumber: pageNum,
      });
      setCompareOutput(out);
      toast.push("success", "比較が完了しました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCompareRunning(false);
    }
  }

  function saveCompareImage(): void {
    if (!compareOutput?.resultImage.startsWith("data:image/png;base64,")) {
      toast.push("warning", "保存できる画像がありません。");
      return;
    }
    const a = document.createElement("a");
    a.href = compareOutput.resultImage;
    a.download = `drawing-compare-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.rel = "noopener";
    a.click();
    toast.push("success", "画像のダウンロードを開始しました。");
  }

  const pagePickerDisabled = !comparePathA && !comparePathB;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={16} aria-hidden />
          ヘルプ
        </Button>
      </div>

      <Modal open={helpOpen} title={drawingLibraryHelpTitle("pdf-compare")} onClose={() => setHelpOpen(false)} width="lg">
        <DrawingLibraryHelpContent variant="pdf-compare" />
      </Modal>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
          <span className="text-xs font-medium text-fg-muted">比較元（A）</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void pickCompareFile("a")}>
              PDF を選択
            </Button>
            {comparePathA ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => clearCompareFile("a")}>
                解除
              </Button>
            ) : null}
          </div>
          {comparePathA ? (
            <>
              <span className="break-all text-xs text-fg-subtle" title={comparePathA}>
                {basename(comparePathA)}
              </span>
              {pageCountA != null ? (
                <span className="text-xs text-fg-muted tabular-nums">{pageCountA} ページ</span>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
          <span className="text-xs font-medium text-fg-muted">比較先（B）</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void pickCompareFile("b")}>
              PDF を選択
            </Button>
            {comparePathB ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => clearCompareFile("b")}>
                解除
              </Button>
            ) : null}
          </div>
          {comparePathB ? (
            <>
              <span className="break-all text-xs text-fg-subtle" title={comparePathB}>
                {basename(comparePathB)}
              </span>
              {pageCountB != null ? (
                <span className="text-xs text-fg-muted tabular-nums">{pageCountB} ページ</span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="text-fg-muted">比較するページ</span>
        <input
          type="number"
          min={1}
          max={maxComparePage ?? undefined}
          step={1}
          value={comparePage}
          disabled={pagePickerDisabled || pageCountLoading || maxComparePage == null}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n)) setComparePage(n);
          }}
          className="rounded-lg border border-border-strong bg-bg-surface px-3 py-2 tabular-nums disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="text-xs text-fg-subtle">
          {pageCountLoading
            ? "ページ数を読み取り中…"
            : maxComparePage != null
              ? comparePathA && comparePathB && pageCountA != null && pageCountB != null && pageCountA !== pageCountB
                ? `1〜${maxComparePage}（A: ${pageCountA} ページ / B: ${pageCountB} ページのうち短い方まで）`
                : `1〜${maxComparePage} ページ`
              : pagePickerDisabled
                ? "PDF を選択するとページ番号を指定できます。"
                : "ページ数を取得できませんでした。"}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={
            compareRunning ||
            pageCountLoading ||
            !comparePathA ||
            !comparePathB ||
            comparePathA === comparePathB ||
            maxComparePage == null
          }
          onClick={() => void runCompare()}
        >
          {compareRunning ? "比較実行中…" : "比較を実行"}
        </Button>
        {compareOutput ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => saveCompareImage()}>
            <Download size={16} />
            比較画像を保存
          </Button>
        ) : null}
      </div>

      {compareOutput ? (
        <div className="rounded-lg border border-border-subtle bg-bg-elevated/30 p-3">
          <p className="text-xs text-fg-muted">{compareOutput.message}</p>
          <img
            src={compareOutput.resultImage}
            alt="比較結果"
            className="mt-2 max-h-[60vh] w-full object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
