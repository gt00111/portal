import {
  Box,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ModelAnalysis,
  ModelAnalysisRecord,
  ProcessCondition,
  ProcessConditionBend,
  SimulationModel,
  SimulationModelFilePayload,
} from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import {
  StepViewer,
  type DisplayMode,
  type StepViewerHandle,
  type ViewName,
} from "@renderer/routes/sheet-metal-support/StepViewer.js";

/** 再生時に 1 ステップを表示する時間（ミリ秒） */
const PLAY_INTERVAL_MS = 1200;

const DISPLAY_MODES: ReadonlyArray<{ value: DisplayMode; label: string }> = [
  { value: "shaded", label: "シェーディング" },
  { value: "wireframe", label: "ワイヤー" },
  { value: "transparent", label: "透過" },
];

const VIEWS: ReadonlyArray<{ value: ViewName; label: string }> = [
  { value: "iso", label: "等角" },
  { value: "front", label: "正面" },
  { value: "top", label: "上面" },
  { value: "right", label: "右側面" },
];

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

function fmt(value: number | null, unit = ""): string {
  return value == null ? "—" : `${value}${unit}`;
}

function ToolbarButton({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] transition-colors",
        active
          ? "bg-accent-primary/20 text-accent-primary"
          : "text-fg-muted hover:bg-bg-surface hover:text-fg-primary"
      )}
    >
      {children}
    </button>
  );
}

export function SimulationPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const viewerRef = useRef<StepViewerHandle>(null);

  const [model, setModel] = useState<SimulationModel | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [condition, setCondition] = useState<ProcessCondition | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showEdges, setShowEdges] = useState(true);
  const [showBendLines, setShowBendLines] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shaded");
  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null);
  const [analysisSaved, setAnalysisSaved] = useState(false);

  /** 0 = 完成形、1..N = 各曲げステップ */
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const bends = useMemo<ProcessConditionBend[]>(
    () => [...(condition?.bends ?? [])].sort((a, b) => a.bendSequence - b.bendSequence),
    [condition]
  );
  const bendCount = bends.length;
  const currentBend = stepIndex > 0 ? bends[stepIndex - 1] : null;

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
      const [m, c] = await Promise.all([
        invoke<SimulationModel | null>("smsupport:simulation:getByPart", { partNumber }),
        invoke<ProcessCondition | null>("smsupport:processCondition:getByPart", { partNumber }),
      ]);
      setModel(m);
      setCondition(c);
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

  /** 検出結果は判定エンジンの入力になるため、解析できた時点で保存しておく */
  const handleAnalyzed = useCallback(
    (result: ModelAnalysis) => {
      setAnalysis(result);
      setAnalysisSaved(false);
      if (!writable) return;
      void (async () => {
        try {
          await invoke<ModelAnalysisRecord>("smsupport:simulation:saveAnalysis", {
            partNumber,
            analysis: result,
          });
          setAnalysisSaved(true);
        } catch (err) {
          toast.push("error", errMsg(err));
        }
      })();
    },
    [partNumber, writable, toast]
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev >= bendCount ? prev : prev + 1));
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, bendCount]);

  useEffect(() => {
    if (playing && stepIndex >= bendCount) setPlaying(false);
  }, [playing, stepIndex, bendCount]);

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

  function handlePlayToggle(): void {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (stepIndex >= bendCount) setStepIndex(0);
    setPlaying(true);
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
        {writable && (
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        )}
      </div>

      {bytes && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-subtle bg-bg-surface/40 px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            {DISPLAY_MODES.map((m) => (
              <ToolbarButton
                key={m.value}
                active={displayMode === m.value}
                onClick={() => setDisplayMode(m.value)}
              >
                {m.label}
              </ToolbarButton>
            ))}
          </div>
          <span className="h-4 w-px bg-border-subtle" aria-hidden />
          <div className="flex items-center gap-0.5">
            {VIEWS.map((v) => (
              <ToolbarButton key={v.value} onClick={() => viewerRef.current?.setView(v.value)}>
                {v.label}
              </ToolbarButton>
            ))}
            <ToolbarButton title="全体表示" onClick={() => viewerRef.current?.fit()}>
              <span className="inline-flex items-center gap-1">
                <Maximize2 className="h-3 w-3" aria-hidden />
                フィット
              </span>
            </ToolbarButton>
          </div>
          <span className="h-4 w-px bg-border-subtle" aria-hidden />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={showEdges}
              onChange={(e) => setShowEdges(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent-primary"
            />
            エッジ表示
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
            <input
              type="checkbox"
              checked={showBendLines}
              onChange={(e) => setShowBendLines(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent-primary"
            />
            曲げ線
          </label>
        </div>
      )}

      {bytes ? (
        <StepViewer
          ref={viewerRef}
          bytes={bytes}
          showEdges={showEdges}
          displayMode={displayMode}
          showBendLines={showBendLines}
          thicknessHint={condition?.thickness ?? null}
          onAnalyzed={handleAnalyzed}
        />
      ) : (
        <div className="flex h-[52vh] min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border-subtle bg-bg-surface/40 px-4 text-center text-sm text-fg-muted">
          {model?.fileName
            ? "3Dモデルを読み込めませんでした。"
            : writable
              ? "「STEP登録」から 3Dモデル（.step / .stp）を登録すると、ここで回転・拡大して確認できます。"
              : "3Dモデルはまだ登録されていません。"}
        </div>
      )}

      {bytes && (
        <BendDetectionSection analysis={analysis} condition={condition} saved={analysisSaved} />
      )}

      {/* 曲げ工程のステップ再生（加工条件の曲げ順と連動） */}
      <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-surface/40 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-fg-primary">曲げ工程</span>
          {bendCount > 0 && (
            <span className="text-[11px] text-fg-subtle">
              {stepIndex === 0 ? "完成形" : `曲げ ${stepIndex} / ${bendCount}`}
            </span>
          )}
        </div>

        {bendCount === 0 ? (
          <p className="py-2 text-center text-xs text-fg-muted">
            「加工条件」タブで曲げ順を登録すると、ここで工程を順に再生できます。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="完成形に戻す"
                onClick={() => {
                  setPlaying(false);
                  setStepIndex(0);
                }}
              >
                <SkipBack className="h-4 w-4" aria-hidden />
                <span>リセット</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={stepIndex <= 0}
                onClick={() => {
                  setPlaying(false);
                  setStepIndex((prev) => Math.max(0, prev - 1));
                }}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                <span>戻し</span>
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handlePlayToggle}>
                {playing ? (
                  <>
                    <Pause className="h-4 w-4" aria-hidden />
                    <span>一時停止</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden />
                    <span>再生</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={stepIndex >= bendCount}
                onClick={() => {
                  setPlaying(false);
                  setStepIndex((prev) => Math.min(bendCount, prev + 1));
                }}
              >
                <span>送り</span>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1">
              {bends.map((b, index) => (
                <button
                  key={`${b.id ?? "new"}-${b.bendSequence}-${index}`}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setStepIndex(index + 1);
                  }}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] transition-colors",
                    stepIndex === index + 1
                      ? "bg-accent-primary/20 text-accent-primary"
                      : "bg-bg-elevated text-fg-muted hover:text-fg-primary"
                  )}
                >
                  曲げ {b.bendSequence}
                </button>
              ))}
            </div>

            {currentBend && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                <StepField label="上型" value={currentBend.upperToolName} />
                <StepField label="下型" value={currentBend.lowerToolName} />
                <StepField label="機械" value={currentBend.machineName} />
                <StepField label="角度" value={fmt(currentBend.angle, "°")} />
                <StepField label="バックゲージ" value={fmt(currentBend.backGauge, " mm")} />
                <StepField label="曲げR" value={fmt(currentBend.bendRadius, " mm")} />
                {currentBend.note && (
                  <div className="col-span-2 flex flex-col sm:col-span-3">
                    <dt className="text-fg-subtle">メモ</dt>
                    <dd className="whitespace-pre-wrap text-fg-primary">{currentBend.note}</dd>
                  </div>
                )}
              </dl>
            )}
          </>
        )}
      </div>

      {model?.updatedAt && (
        <p className="text-[11px] text-fg-subtle">
          最終更新 {model.updatedByName ? `${model.updatedByName} ・ ` : ""}
          {model.updatedAt}
        </p>
      )}
    </div>
  );
}

/** STEP 形状から検出した曲げ線と、登録済み加工条件との突き合わせ */
function BendDetectionSection({
  analysis,
  condition,
  saved,
}: {
  analysis: ModelAnalysis | null;
  condition: ProcessCondition | null;
  saved: boolean;
}): JSX.Element {
  if (!analysis) {
    return (
      <p className="rounded-xl border border-border-subtle bg-bg-surface/40 p-2.5 text-xs text-fg-subtle">
        形状を解析しています…
      </p>
    );
  }

  const detected = analysis.bends;
  const registeredCount = condition?.bends.length ?? 0;
  const checks: Array<{ ok: boolean; message: string }> = [];

  if (!analysis.brepFacesAvailable) {
    checks.push({
      ok: false,
      message: "STEP から面情報を取得できず、面単位の判定ができませんでした。",
    });
  }
  if (registeredCount > 0) {
    checks.push({
      ok: registeredCount === detected.length,
      message:
        registeredCount === detected.length
          ? `加工条件の曲げ順（${registeredCount} 箇所）と一致しています。`
          : `加工条件の曲げ順は ${registeredCount} 箇所ですが、形状からは ${detected.length} 箇所を検出しました。`,
    });
  }
  if (analysis.thickness != null && condition?.thickness != null) {
    const diff = Math.abs(analysis.thickness - condition.thickness);
    checks.push({
      ok: diff <= 0.2,
      message:
        diff <= 0.2
          ? `推定板厚 ${analysis.thickness}mm は加工条件の板厚 ${condition.thickness}mm と一致しています。`
          : `推定板厚 ${analysis.thickness}mm が加工条件の板厚 ${condition.thickness}mm と異なります。`,
    });
  }
  if (analysis.thicknessSource === "unknown") {
    checks.push({
      ok: false,
      message:
        "板厚が分からないため、コーナーR と曲げの分類を保留しています。「加工条件」タブで板厚を登録してください。",
    });
  } else if (analysis.thicknessSource === "estimated") {
    checks.push({
      ok: false,
      message: `分類の基準に形状から推定した板厚 ${fmt(analysis.basisThickness ?? null, "mm")} を使用しました。「加工条件」タブで板厚を登録すると精度が上がります。`,
    });
  }
  const reviewCount = detected.filter((b) => b.confidence === "review").length;
  if (reviewCount > 0) {
    checks.push({
      ok: false,
      message: `内側と外側の円筒が対で取れなかった箇所が ${reviewCount} 件あります（曲げ以外の R の可能性）。`,
    });
  }

  const excluded = analysis.excluded;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-surface/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-primary">曲げ線検出（形状解析）</span>
        <span className="text-[11px] text-fg-subtle">
          円筒面 {analysis.cylinderCount} ／ 曲げ {detected.length} 箇所 ／ 推定板厚{" "}
          {fmt(analysis.thickness, " mm")}
        </span>
      </div>

      {excluded && (
        <p className="text-[11px] text-fg-subtle">
          曲げ以外として除外: 穴・バーリング {excluded.holes} ／ 外形コーナーR{" "}
          {excluded.cornerFillets} ／ 面取りR {excluded.edgeFillets}
        </p>
      )}

      {detected.length === 0 ? (
        <p className="py-2 text-center text-xs text-fg-muted">
          円筒状の曲げ部を検出できませんでした。平板、または曲げ R が表現されていない形状の可能性があります。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11px]">
            <thead className="text-fg-subtle">
              <tr>
                <th className="py-1 font-medium">No.</th>
                <th className="py-1 font-medium">内R</th>
                <th className="py-1 font-medium">外R</th>
                <th className="py-1 font-medium">曲げ角度</th>
                <th className="py-1 font-medium">曲げ線長さ</th>
                <th className="py-1 font-medium">確度</th>
              </tr>
            </thead>
            <tbody className="text-fg-muted">
              {detected.map((bend) => (
                <tr key={bend.index}>
                  <td className="py-1 tabular-nums text-fg-primary">{bend.index}</td>
                  <td className="py-1 tabular-nums">{fmt(bend.innerRadius, " mm")}</td>
                  <td className="py-1 tabular-nums">{fmt(bend.outerRadius, " mm")}</td>
                  <td className="py-1 tabular-nums">{fmt(bend.angleDeg, "°")}</td>
                  <td className="py-1 tabular-nums">{fmt(bend.lengthMm, " mm")}</td>
                  <td className="py-1">
                    {bend.confidence === "review" ? (
                      <span className="rounded bg-state-warning/15 px-1.5 py-0.5 text-[10px] text-state-warning">
                        要確認
                      </span>
                    ) : (
                      <span className="text-[10px] text-state-success">確定</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {checks.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {checks.map((check) => (
            <li
              key={check.message}
              className={cn("text-[11px]", check.ok ? "text-state-success" : "text-state-warning")}
            >
              {check.ok ? "✓" : "!"} {check.message}
            </li>
          ))}
        </ul>
      )}

      {saved && (
        <p className="text-[11px] text-fg-subtle">
          検出結果を保存しました。「加工判定」タブで曲げ順の自動生成と干渉判定に使用されます。
        </p>
      )}
    </div>
  );
}

function StepField({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-fg-primary">{value || "—"}</dd>
    </div>
  );
}
