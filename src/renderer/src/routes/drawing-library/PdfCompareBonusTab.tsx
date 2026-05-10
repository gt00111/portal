import { Download, HelpCircle } from "lucide-react";
import { useState } from "react";

import type { CompareDrawingsResult } from "@shared/drawingLibrary.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import {
  DRAWING_LIBRARY_OVERVIEW,
  PDF_COMPARE_TAB_HELP_NOTE,
  PDF_COMPARE_TAB_HELP_PRIMARY,
} from "@renderer/routes/drawing-library/drawingLibraryHelpCopy.js";

/** おまけ: 外部 PDF 2 件を compare_drawings で差分表示 */
export function PdfCompareBonusTab(): JSX.Element {
  const toast = useToast();
  const [comparePathA, setComparePathA] = useState<string | null>(null);
  const [comparePathB, setComparePathB] = useState<string | null>(null);
  const [comparePage, setComparePage] = useState("");
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareOutput, setCompareOutput] = useState<CompareDrawingsResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  async function pickCompareFile(which: "a" | "b"): Promise<void> {
    try {
      const { path } = await invoke<{ path: string }>("drawing-library:pickPdfForCompare", {});
      if (which === "a") setComparePathA(path);
      else setComparePathB(path);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
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
    const pageNum = comparePage.trim() === "" ? undefined : Number.parseInt(comparePage, 10);
    if (comparePage.trim() !== "" && !Number.isFinite(pageNum)) {
      toast.push("warning", "ページ番号は数値で入力してください。");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-start">
        <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={16} aria-hidden />
          ヘルプ
        </Button>
      </div>

      <Modal open={helpOpen} title="図面ライブラリ（PDF比較）のヘルプ" onClose={() => setHelpOpen(false)} width="lg">
        <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
          <p>{DRAWING_LIBRARY_OVERVIEW}</p>
          <p>{PDF_COMPARE_TAB_HELP_PRIMARY}</p>
          <p className="text-xs text-fg-muted">{PDF_COMPARE_TAB_HELP_NOTE}</p>
        </div>
      </Modal>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
          <span className="text-xs font-medium text-fg-muted">比較元（A）</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void pickCompareFile("a")}>
            PDF を選択
          </Button>
          {comparePathA && (
            <span className="break-all text-xs text-fg-subtle" title={comparePathA}>
              {comparePathA}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
          <span className="text-xs font-medium text-fg-muted">比較先（B）</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void pickCompareFile("b")}>
            PDF を選択
          </Button>
          {comparePathB && (
            <span className="break-all text-xs text-fg-subtle" title={comparePathB}>
              {comparePathB}
            </span>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">ページ番号（任意・多ページ PDF 向け）</span>
        <input
          type="text"
          inputMode="numeric"
          value={comparePage}
          onChange={(e) => setComparePage(e.target.value)}
          placeholder="例: 1"
          className="max-w-xs rounded-lg border border-border-strong bg-bg-surface px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={compareRunning || !comparePathA || !comparePathB || comparePathA === comparePathB}
          onClick={() => void runCompare()}
        >
          {compareRunning ? "比較実行中…" : "比較を実行"}
        </Button>
        {compareOutput && (
          <Button type="button" variant="secondary" size="sm" onClick={() => saveCompareImage()}>
            <Download size={16} />
            比較画像を保存
          </Button>
        )}
      </div>
      {compareOutput && (
        <div className="rounded-lg border border-border-subtle bg-bg-elevated/30 p-3">
          <p className="text-xs text-fg-muted">{compareOutput.message}</p>
          <img
            src={compareOutput.resultImage}
            alt="比較結果"
            className="mt-2 max-h-[60vh] w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
