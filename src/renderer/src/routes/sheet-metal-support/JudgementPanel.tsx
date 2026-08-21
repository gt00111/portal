import { AlertTriangle, CheckCircle2, Info, Lightbulb, Play, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  BendSequencePlan,
  InterferenceCheck,
  InterferenceLevel,
  JudgementLevel,
  JudgementReason,
  JudgementSeverity,
  OpeningHeightCheck,
  OpeningHeightLevel,
  PressForceCheck,
  PressForceLevel,
  SimulationResult,
  StackHeightCheck,
  StackHeightLevel,
} from "@shared/sheetMetalSupport.js";
import { OPENING_HEIGHT_LABELS, PRESS_FORCE_LABELS, STACK_HEIGHT_LABELS } from "@shared/sheetMetalSupport.js";

import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";

/**
 * 加工判断エンジン（Phase 4）の実行と結果表示。
 * 結果・点数・理由・改善案を常にセットで提示し、詳細モードで工程ごとの算出値を開示する。
 */

const JUDGEMENT_STYLE: Record<JudgementLevel, { text: string; ring: string; bg: string }> = {
  good: { text: "text-state-success", ring: "ring-state-success/40", bg: "bg-state-success/10" },
  ok: { text: "text-accent-primary", ring: "ring-accent-primary/40", bg: "bg-accent-primary/10" },
  caution: { text: "text-state-warning", ring: "ring-state-warning/40", bg: "bg-state-warning/10" },
  difficult: { text: "text-state-danger", ring: "ring-state-danger/40", bg: "bg-state-danger/10" },
};

const SEVERITY_STYLE: Record<JudgementSeverity, { text: string; label: string }> = {
  info: { text: "text-fg-muted", label: "情報" },
  warn: { text: "text-state-warning", label: "注意" },
  error: { text: "text-state-danger", label: "重大" },
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function severityIcon(severity: JudgementSeverity): JSX.Element {
  if (severity === "error") return <XCircle className="h-3.5 w-3.5 shrink-0" />;
  if (severity === "warn") return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  return <Info className="h-3.5 w-3.5 shrink-0" />;
}

function fmt(value: number | null, unit = ""): string {
  return value == null ? "—" : `${value}${unit}`;
}

export function JudgementPanel({
  partNumber,
  writable,
}: {
  partNumber: string;
  writable: boolean;
}): JSX.Element {
  const toast = useToast();
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [detailMode, setDetailMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await invoke<SimulationResult | null>("smsupport:simulation:getResult", { partNumber }));
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [partNumber, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun(): Promise<void> {
    setRunning(true);
    try {
      const next = await invoke<SimulationResult>("smsupport:simulation:run", { partNumber });
      setResult(next);
      toast.push("success", `判定しました（${next.judgementLabel} / ${next.processScore}点）`);
    } catch (err) {
      toast.push("error", errMsg(err));
    } finally {
      setRunning(false);
    }
  }

  const style = result ? JUDGEMENT_STYLE[result.judgement] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          加工条件（材質・板厚・曲げ順）から金型・加工条件・加工性を判定します。
        </p>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={detailMode}
              onChange={(e) => setDetailMode(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent-primary"
            />
            詳細モード
          </label>
          {writable && (
            <Button size="sm" onClick={handleRun} disabled={running}>
              <Play className="mr-1 h-3.5 w-3.5" />
              {running ? "判定中…" : "判定実行"}
            </Button>
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-fg-subtle">読み込み中…</p>}

      {!loading && !result && (
        <p className="rounded-lg border border-dashed border-border-subtle px-3 py-6 text-center text-xs text-fg-subtle">
          まだ判定を実行していません。
          {writable ? "「判定実行」を押してください。" : "編集権限のある担当者に実行を依頼してください。"}
        </p>
      )}

      {result && style && (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-4 py-3 ring-1",
              style.bg,
              style.ring
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className={cn("text-3xl font-bold tabular-nums", style.text)}>
                {result.processScore}
              </span>
              <span className="text-xs text-fg-muted">/ 100 点</span>
            </div>
            <div className="flex flex-col">
              <span className={cn("text-sm font-semibold", style.text)}>{result.judgementLabel}</span>
              <span className="text-[11px] text-fg-subtle">
                干渉判定: {result.interferenceResult ?? "—"}
              </span>
            </div>
            <div className="ml-auto text-right text-[11px] text-fg-subtle">
              <div>
                材質: {result.material || "未入力"}
                {!result.materialResolved && "（軟鋼相当で計算）"}
              </div>
              <div>
                板厚: {fmt(result.thickness, "mm")} / 引張強さ:{" "}
                {fmt(result.tensileStrength, "N/mm²")}
              </div>
            </div>
          </div>

          <ReasonList reasons={result.reasons} />

          <PressForceSection pressForce={result.pressForce} detailMode={detailMode} />

          <OpeningHeightSection openingHeight={result.openingHeight} detailMode={detailMode} />

          <StackHeightSection stackHeight={result.stackHeight} detailMode={detailMode} />

          <InterferenceSection interference={result.interference} />

          <BendPlanSection plan={result.plan} detailMode={detailMode} />

          <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg-primary">
              <Lightbulb className="h-3.5 w-3.5 text-state-warning" />
              改善案
            </h4>
            <ul className="flex flex-col gap-1">
              {result.recommendations.map((item) => (
                <li key={item} className="flex gap-1.5 text-xs text-fg-muted">
                  <span className="text-fg-subtle">・</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {detailMode && <BendDetailTable bends={result.bends} />}

          <p className="text-right text-[11px] text-fg-subtle">
            判定日時: {result.evaluatedAt}
            {result.evaluatedByName ? ` / ${result.evaluatedByName}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function ReasonList({ reasons }: { reasons: JudgementReason[] }): JSX.Element {
  if (reasons.length === 0) {
    return (
      <section className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-surface/40 p-3 text-xs text-state-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        減点項目はありません。
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 text-xs font-semibold text-fg-primary">判定理由（減点内訳）</h4>
      <ul className="flex flex-col gap-1.5">
        {reasons.map((reason, index) => {
          const severity = SEVERITY_STYLE[reason.severity];
          return (
            <li
              key={`${reason.category}-${reason.bendSequence ?? "all"}-${index}`}
              className="flex items-start gap-1.5 text-xs"
            >
              <span className={severity.text}>{severityIcon(reason.severity)}</span>
              <span className="shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-fg-muted">
                {reason.bendSequence != null ? `曲げNo.${reason.bendSequence}` : "全体"}／
                {reason.category}
              </span>
              <span className="flex-1 text-fg-muted">{reason.message}</span>
              <span className={cn("shrink-0 tabular-nums", severity.text)}>
                -{reason.deduction}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const INTERFERENCE_STYLE: Record<InterferenceLevel, { text: string; label: string }> = {
  none: { text: "text-state-success", label: "干渉なし" },
  caution: { text: "text-state-warning", label: "要注意" },
  risk: { text: "text-state-danger", label: "干渉の恐れ" },
  unknown: { text: "text-fg-muted", label: "未評価" },
};

const PRESS_FORCE_STYLE: Record<PressForceLevel, string> = {
  ok: "text-state-success",
  caution: "text-state-warning",
  over: "text-state-danger",
  unknown: "text-fg-muted",
};

const OPENING_HEIGHT_STYLE: Record<OpeningHeightLevel, string> = {
  ok: "text-state-success",
  caution: "text-state-warning",
  over: "text-state-danger",
  unknown: "text-fg-muted",
};

const STACK_HEIGHT_STYLE: Record<StackHeightLevel, string> = {
  ok: "text-state-success",
  change: "text-state-warning",
  unknown: "text-fg-muted",
};

function PressForceSection({
  pressForce,
  detailMode,
}: {
  pressForce: PressForceCheck | null;
  detailMode: boolean;
}): JSX.Element | null {
  if (!pressForce) return null;
  const ratio = pressForce.usageRatio;
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-primary">
        必要加圧力
        <span
          className={cn(
            "rounded bg-bg-elevated px-1.5 py-0.5 text-[10px]",
            PRESS_FORCE_STYLE[pressForce.level]
          )}
        >
          {PRESS_FORCE_LABELS[pressForce.level]}
        </span>
      </h4>
      <p className="text-xs text-fg-muted">{pressForce.message}</p>
      {ratio != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className={cn(
              "h-full rounded-full",
              pressForce.level === "over"
                ? "bg-state-danger"
                : pressForce.level === "caution"
                  ? "bg-state-warning"
                  : "bg-state-success"
            )}
            style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
          />
        </div>
      )}
      {detailMode && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border-subtle pt-2 text-[11px] sm:grid-cols-3">
          <Metric label="曲げ荷重" value={fmt(pressForce.forcePerMeter, " kN/m")} />
          <Metric label="曲げ線長さ" value={fmt(pressForce.bendLengthMm, " mm")} />
          <Metric
            label="V幅"
            value={`${fmt(pressForce.vWidth, " mm")}${pressForce.vWidthFromMaster ? "（マスタ）" : "（推定）"}`}
          />
          <Metric label="必要加圧力" value={fmt(pressForce.requiredForce, " kN")} />
          <Metric label="機械能力" value={fmt(pressForce.machineCapacity, " kN")} />
          <Metric
            label="耐圧"
            value={`${fmt(pressForce.toolMaxLoad, " kN/m")}${pressForce.toolMaxLoadName ? `（${pressForce.toolMaxLoadName}）` : ""}`}
          />
        </dl>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="tabular-nums text-fg-muted">{value}</dd>
    </div>
  );
}

function OpeningHeightSection({
  openingHeight,
  detailMode,
}: {
  openingHeight: OpeningHeightCheck | null;
  detailMode: boolean;
}): JSX.Element | null {
  if (!openingHeight) return null;
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-primary">
        開口高さ
        <span className={cn("rounded bg-bg-elevated px-1.5 py-0.5 text-[10px]", OPENING_HEIGHT_STYLE[openingHeight.level])}>
          {OPENING_HEIGHT_LABELS[openingHeight.level]}
        </span>
      </h4>
      <p className="text-xs text-fg-muted">{openingHeight.message}</p>
      {detailMode && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border-subtle pt-2 text-[11px] sm:grid-cols-3">
          <Metric label="上側合計" value={fmt(openingHeight.upperHeight, " mm")} />
          <Metric label="下側合計" value={fmt(openingHeight.lowerHeight, " mm")} />
          <Metric label="金型合計" value={fmt(openingHeight.combinedHeight, " mm")} />
          <Metric label="開口高さ" value={fmt(openingHeight.openHeight, " mm")} />
          <Metric label="残り" value={fmt(openingHeight.remaining, " mm")} />
          <Metric label="立ち上がり" value={fmt(openingHeight.maxFlangeHeight, " mm")} />
          <Metric label="ストローク" value={fmt(openingHeight.strokeLength, " mm")} />
        </dl>
      )}
    </section>
  );
}

function StackHeightSection({
  stackHeight,
  detailMode,
}: {
  stackHeight: StackHeightCheck | null;
  detailMode: boolean;
}): JSX.Element | null {
  if (!stackHeight) return null;
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-primary">
        段替え（金型高さ）
        <span className={cn("rounded bg-bg-elevated px-1.5 py-0.5 text-[10px]", STACK_HEIGHT_STYLE[stackHeight.level])}>
          {STACK_HEIGHT_LABELS[stackHeight.level]}
        </span>
      </h4>
      <p className="text-xs text-fg-muted">{stackHeight.message}</p>
      {detailMode && stackHeight.byBend.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border-subtle pt-2 text-[11px] sm:grid-cols-3">
          {stackHeight.byBend.map((row) => (
            <Metric
              key={row.bendSequence}
              label={`No.${row.bendSequence} 合計`}
              value={fmt(row.combinedHeight, " mm")}
            />
          ))}
          <Metric label="工程間差" value={fmt(stackHeight.spread, " mm")} />
        </dl>
      )}
    </section>
  );
}

function InterferenceSection({
  interference,
}: {
  interference: InterferenceCheck | null;
}): JSX.Element | null {
  if (!interference) return null;
  const style = INTERFERENCE_STYLE[interference.level];
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-primary">
        干渉判定
        <span className={cn("rounded bg-bg-elevated px-1.5 py-0.5 text-[10px]", style.text)}>
          {style.label}
        </span>
        <span className="font-normal text-fg-muted">{interference.summary}</span>
      </h4>
      {interference.items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {interference.items.map((item, index) => (
            <li key={`${item.order}-${index}`} className="flex items-start gap-1.5 text-xs">
              <span className={SEVERITY_STYLE[item.severity].text}>
                {severityIcon(item.severity)}
              </span>
              <span className="shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-fg-muted">
                工程 {item.order}
              </span>
              <span className="flex-1 text-fg-muted">{item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BendPlanSection({
  plan,
  detailMode,
}: {
  plan: BendSequencePlan | null;
  detailMode: boolean;
}): JSX.Element | null {
  if (!plan) return null;
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-surface/40 p-3">
      <h4 className="mb-2 text-xs font-semibold text-fg-primary">推奨曲げ順（形状から自動生成）</h4>
      {plan.steps.length === 0 ? (
        <p className="text-xs text-fg-muted">曲げ部を検出できないため、曲げ順を生成できません。</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {plan.steps.map((step) => (
            <li key={step.order} className="flex items-start gap-2 text-xs">
              <span className="mt-px shrink-0 rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
                {step.order}
              </span>
              <div className="flex-1">
                <span className="text-fg-primary">
                  検出 No.{step.detectedIndex}／内R {step.innerRadius}mm／{step.angleDeg}°／曲げ線{" "}
                  {step.lengthMm}mm
                  {step.flangeLengthMm != null && `／推定フランジ ${step.flangeLengthMm}mm`}
                </span>
                <p className="text-[11px] text-fg-muted">{step.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {detailMode && plan.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 border-t border-border-subtle pt-2">
          {plan.notes.map((note) => (
            <li key={note} className="text-[11px] text-fg-subtle">
              ・{note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BendDetailTable({ bends }: { bends: SimulationResult["bends"] }): JSX.Element {
  if (bends.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-fg-subtle">
        曲げ順が登録されていないため、工程ごとの算出値はありません。
      </p>
    );
  }
  return (
    <section className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full min-w-[720px] text-left text-[11px]">
        <thead className="bg-bg-elevated text-fg-muted">
          <tr>
            <th className="px-2 py-1.5 font-medium">No.</th>
            <th className="px-2 py-1.5 font-medium">推奨V幅</th>
            <th className="px-2 py-1.5 font-medium">推奨内R</th>
            <th className="px-2 py-1.5 font-medium">最小フランジ</th>
            <th className="px-2 py-1.5 font-medium">曲げ荷重</th>
            <th className="px-2 py-1.5 font-medium">上型</th>
            <th className="px-2 py-1.5 font-medium">下型（推奨）</th>
            <th className="px-2 py-1.5 font-medium">指摘</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle text-fg-muted">
          {bends.map((bend) => (
            <tr key={bend.bendSequence}>
              <td className="px-2 py-1.5 tabular-nums text-fg-primary">{bend.bendSequence}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(bend.recommendedVWidth, "mm")}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(bend.recommendedInnerRadius, "mm")}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(bend.minFlangeLength, "mm")}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(bend.bendForcePerMeter, " kN/m")}</td>
              <td className="px-2 py-1.5">{bend.upperToolName || "—"}</td>
              <td className="px-2 py-1.5">
                {bend.lowerToolName || "—"}
                {bend.suggestedLowerToolName && !bend.lowerToolName && (
                  <span className="text-fg-subtle">（候補: {bend.suggestedLowerToolName}）</span>
                )}
              </td>
              <td className="px-2 py-1.5">
                {bend.issues.length === 0 ? (
                  <span className="text-state-success">問題なし</span>
                ) : (
                  <span className="text-state-warning">{bend.issues.length} 件</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
