import { Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { SheetMetalCamResult } from "@shared/sheetMetalCam.js";
import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

export function CamIntegrationPanel({ partNumber, writable }: { partNumber: string; writable: boolean }): JSX.Element {
  const toast = useToast();
  const [result, setResult] = useState<SheetMetalCamResult | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setResult(await invoke<SheetMetalCamResult | null>("smsupport:cam:getLatestResult", { partNumber })); }
    catch (err) { toast.push("error", err instanceof Error ? err.message : String(err)); }
  }, [partNumber, toast]);
  useEffect(() => void load(), [load]);
  async function importResult(): Promise<void> {
    setBusy(true);
    try {
      setResult(await invoke<SheetMetalCamResult>("smsupport:cam:importResult", { partNumber }));
      toast.push("success", "M-BENDの加工条件・曲げ順を取り込みました。");
    } catch (err) { toast.push("error", err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <section className="rounded-xl border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold text-fg-primary">M-BEND加工結果</h3><p className="mt-1 text-xs text-fg-muted">設定・起動はポータルホームの「M-BEND」から行います。</p></div>
        {writable && <Button size="sm" disabled={busy} onClick={() => void importResult()}><Upload className="h-4 w-4" /> 最新結果を取り込む</Button>}
      </div>
      {result ? <><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Value label="判定" value={result.level ?? result.status} /><Value label="機械" value={result.machineName} /><Value label="上型" value={result.upperToolName} /><Value label="下型" value={result.lowerToolName} />
        <Value label="材質" value={result.materialLabel} /><Value label="板厚" value={result.thicknessMm == null ? null : `${result.thicknessMm} mm`} /><Value label="推奨V幅" value={result.recommendedVWidthMm == null ? null : `${result.recommendedVWidthMm} mm`} /><Value label="干渉／警告" value={`${result.collisionCount} / ${result.warningCount}`} />
      </dl><p className="mt-4 rounded-lg bg-bg-elevated p-3 text-sm text-fg-primary">{result.summary || "解析概要なし"}</p></> : <p className="mt-4 rounded-lg bg-bg-elevated p-4 text-sm text-fg-muted">この品番のM-BEND結果はまだ取り込まれていません。</p>}
    </section>
    {result && <section className="rounded-xl border border-border-subtle bg-bg-surface p-4">
      <h3 className="font-semibold text-fg-primary">金型条件・曲げ順</h3>
      {result.bends.length === 0 ? <p className="mt-3 text-sm text-fg-muted">曲げ別条件がありません。</p> : <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-bg-elevated text-xs text-fg-subtle"><tr><th className="px-3 py-2">順番</th><th className="px-3 py-2">曲げ</th><th className="px-3 py-2">角度</th><th className="px-3 py-2">内R</th><th className="px-3 py-2">上型</th><th className="px-3 py-2">下型</th><th className="px-3 py-2">判定</th></tr></thead>
        <tbody>{result.bends.map((bend, index) => <tr key={`${bend.bendId}-${index}`} className="border-t border-border-subtle"><td className="px-3 py-2 font-medium">{bend.sequence ?? "—"}</td><td className="px-3 py-2">{bend.bendId}</td><td className="px-3 py-2">{bend.angleDeg == null ? "—" : `${bend.angleDeg}°`}</td><td className="px-3 py-2">{bend.innerRadiusMm == null ? "—" : `${bend.innerRadiusMm} mm`}</td><td className="px-3 py-2">{bend.upperToolName || "—"}</td><td className="px-3 py-2">{bend.lowerToolName || "—"}</td><td className="px-3 py-2">{bend.status || "—"}</td></tr>)}</tbody>
      </table></div>}
      <p className="mt-3 text-xs text-fg-muted">加工動画はM-BENDのManufacturing Planに姿勢・角度の時系列データを追加後、ワーク3Dへ接続します。</p>
    </section>}
  </div>;
}

function Value({ label, value }: { label: string; value: string | null }): JSX.Element {
  return <div><dt className="text-xs text-fg-subtle">{label}</dt><dd className="mt-1 font-medium text-fg-primary">{value || "—"}</dd></div>;
}
