import { Download } from "lucide-react";
import { useState } from "react";

import type { CompareDrawingsResult } from "@shared/drawingLibrary.js";

import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

/** おまけ: 外部 PDF 2 件を compare_drawings で差分表示 */
export function PdfCompareBonusTab(): JSX.Element {
  const toast = useToast();
  const [comparePathA, setComparePathA] = useState<string | null>(null);
  const [comparePathB, setComparePathB] = useState<string | null>(null);
  const [comparePage, setComparePage] = useState("");
  const [compareRunning, setCompareRunning] = useState(false);
  const [compareOutput, setCompareOutput] = useState<CompareDrawingsResult | null>(null);

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
      <p className="text-sm text-fg-muted">
        補助機能です。登録図面 DB に依存せず、ローカルの PDF を2つ選んで比較します（compare_drawings.exe または Python
        スクリプト）。
      </p>
      <p className="text-xs text-fg-subtle">
        初回のみ: 社内配布用に <strong className="font-medium text-fg-muted">compare_drawings.exe</strong> を使う場合は、
        <code className="rounded bg-bg-elevated px-1">resources/tools/</code> に配置するか、環境変数{" "}
        <code className="rounded bg-bg-elevated px-1">DRAWING_COMPARE_EXE</code> で指定してください（詳細は同フォルダの
        README）。Python 利用時は Poppler を{" "}
        <code className="rounded bg-bg-elevated px-1">POPPLER_PATH</code> で指定できます。
      </p>
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
