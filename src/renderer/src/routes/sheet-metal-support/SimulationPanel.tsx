import { Box, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  SimulationModel,
  SimulationModelFilePayload,
} from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { StepViewer } from "@renderer/routes/sheet-metal-support/StepViewer.js";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function SimulationPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const [model, setModel] = useState<SimulationModel | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEdges, setShowEdges] = useState(true);

  const loadModelBytes = useCallback(async () => {
    try {
      const file = await invoke<SimulationModelFilePayload>("smsupport:simulation:getModelFile", {
        partNumber,
      });
      setBytes(base64ToBytes(file.base64));
    } catch (err) {
      setBytes(null);
      toast.push("error", errMsg(err));
    }
  }, [partNumber, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setBytes(null);
    try {
      const m = await invoke<SimulationModel | null>("smsupport:simulation:getByPart", {
        partNumber,
      });
      setModel(m);
      if (m?.modelFilePath) {
        await loadModelBytes();
      }
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [partNumber, loadModelBytes, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(): Promise<void> {
    setBusy(true);
    try {
      const saved = await invoke<SimulationModel>("smsupport:simulation:pickModel", { partNumber });
      setModel(saved);
      await loadModelBytes();
      toast.push("success", "3Dモデルを登録しました。");
    } catch (err) {
      const msg = errMsg(err);
      if (!msg.includes("選択されませんでした")) toast.push("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm("登録済みの3Dモデルを削除しますか？")) return;
    setBusy(true);
    try {
      await invoke<{ partNumber: string }>("smsupport:simulation:deleteModel", { partNumber });
      setModel(null);
      setBytes(null);
      toast.push("success", "3Dモデルを削除しました。");
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-4 text-center text-sm text-fg-muted">読み込み中...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-fg-muted">
          {model?.fileName ? (
            <span className="inline-flex items-center gap-1.5 text-fg-primary">
              <Box className="h-4 w-4 text-accent-primary" aria-hidden />
              <span className="truncate">{model.fileName}</span>
            </span>
          ) : (
            "3Dモデル（STEP）は未登録です。"
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {bytes && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={showEdges}
                onChange={(e) => setShowEdges(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent-primary"
              />
              エッジ表示
            </label>
          )}
          {writable && (
            <>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void handleUpload()}>
                <Upload className="h-4 w-4" aria-hidden />
                <span>{model?.fileName ? "差し替え" : "STEP登録"}</span>
              </Button>
              {model?.fileName && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void handleDelete()}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span>削除</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {bytes ? (
        <StepViewer bytes={bytes} showEdges={showEdges} />
      ) : (
        <div className="flex h-[52vh] min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border-subtle bg-bg-surface/40 px-4 text-center text-sm text-fg-muted">
          {model?.fileName
            ? "3Dモデルを読み込めませんでした。"
            : writable
              ? "「STEP登録」から 3Dモデル（.step / .stp）を登録すると、ここで回転・拡大して確認できます。"
              : "3Dモデルはまだ登録されていません。"}
        </div>
      )}

      {model?.updatedAt && (
        <p className="text-[11px] text-fg-subtle">
          最終更新 {model.updatedByName ? `${model.updatedByName} ・ ` : ""}
          {model.updatedAt}
        </p>
      )}
    </div>
  );
}
