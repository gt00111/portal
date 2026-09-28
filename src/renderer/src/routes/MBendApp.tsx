import { ArrowDownToLine, ArrowUpRight, Box, Database, ExternalLink, FolderOpen, Layers3, RefreshCw, Settings2, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getAppRole, type AppRole } from "@shared/auth.js";
import type { SheetMetalCamMasterExport, SheetMetalCamStatus } from "@shared/sheetMetalCam.js";
import type { SessionUser } from "@shared/types.js";
import { MASTER_TABLE_LABELS, type MasterTable } from "@shared/master.js";
import { Button } from "@renderer/components/ui/Button.js";
import { MasterCrud } from "@renderer/components/MasterCrud.js";
import { MBendGeometryPanel } from "@renderer/routes/MBendGeometryPanel.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

const ROLE_LABELS: Record<AppRole, string> = { admin: "管理者", editor: "編集者", viewer: "閲覧者" };
const MASTER_TABS: MasterTable[] = ["m_machines", "m_upper_tools", "m_lower_tools", "m_tool_holders"];

export function MBendApp({ session }: { session: SessionUser }): JSX.Element {
  const toast = useToast();
  const role = getAppRole(session, "m-bend");
  const writable = role === "admin" || role === "editor";
  const [status, setStatus] = useState<SheetMetalCamStatus | null>(null);
  const [lastExport, setLastExport] = useState<SheetMetalCamMasterExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [masterTable, setMasterTable] = useState<MasterTable>("m_machines");
  const [masterRevision, setMasterRevision] = useState(0);
  const [masterMode, setMasterMode] = useState<"basic" | "geometry">("basic");
  const refresh = useCallback(async () => {
    try { setStatus(await invoke<SheetMetalCamStatus>("mbend:status")); }
    catch (err) { toast.push("error", err instanceof Error ? err.message : String(err)); }
  }, [toast]);
  useEffect(() => void refresh(), [refresh]);
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try { await action(); await refresh(); }
    catch (err) { toast.push("error", err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg-base">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-4 sm:px-8">
        <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600"><Layers3 className="h-5 w-5" /></span><div><h1 className="text-lg font-bold tracking-tight text-fg-primary">M-BEND<span className="ml-3 hidden text-[10px] font-medium tracking-[0.2em] text-fg-subtle sm:inline">WORKSPACE</span></h1><p className="text-[11px] text-fg-muted">板金CAM・機械／金型管理</p></div></div>
        <div className="flex items-center gap-2 text-sm text-fg-muted"><User className="h-4 w-4" /> {session.username}<span className="rounded bg-bg-elevated px-2 py-0.5 text-xs">{ROLE_LABELS[role ?? "viewer"]}</span></div>
      </header>
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
        <section className="relative isolate overflow-hidden rounded-3xl bg-[#101e31] text-white shadow-xl shadow-slate-950/10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#8dd8ed 1px, transparent 1px), linear-gradient(90deg, #8dd8ed 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          <div className="relative grid items-center gap-4 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="mb-5 flex items-center gap-2 text-[10px] font-semibold tracking-[0.25em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> SHEET METAL ENGINEERING</p>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">曲げ加工の準備を、<br /><span className="text-cyan-300">ひとつの場所で。</span></h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">機械と金型を管理し、加工の準備を整える。<br className="hidden sm:block" />CadLinkからCAMまで、段取りをつなぐワークスペース。</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {writable && <button type="button" disabled={busy || !status?.configured} onClick={() => void run(async () => { await invoke("mbend:launch"); toast.push("success", "M-BENDを起動しました。"); })} className="inline-flex items-center gap-6 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40">CAMを開く<ArrowUpRight className="h-4 w-4" /></button>}
                <a href="#mbend-masters" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><Database className="h-4 w-4" />金型マスターへ</a>
              </div>
              <p className="mt-4 text-xs text-slate-400">{status == null ? "接続設定を確認しています…" : status.configured ? "接続設定済み · CAMを起動できます" : "下の接続設定でM-BENDの場所を指定してください"}</p>
            </div>
            <BendIllustration />
          </div>
          <div className="relative grid grid-cols-1 border-t border-white/10 bg-white/[0.03] sm:grid-cols-3">
            {[{ number: "01", title: "データ連携", detail: "CadLinkの出力先を設定", icon: FolderOpen }, { number: "02", title: "段取りの準備", detail: "機械・金型・取付基準を管理", icon: Settings2 }, { number: "03", title: "CAMへ接続", detail: "マスターを出力して加工検討へ", icon: ArrowUpRight }].map(({ number, title, detail, icon: Icon }) => <div key={number} className="flex items-center gap-4 px-6 py-4 sm:px-8"><span className="font-mono text-xs text-cyan-300/70">{number}</span><Icon className="h-5 w-5 shrink-0 text-slate-400" /><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div></div>)}
          </div>
        </section>
        <section className="rounded-2xl border border-border-subtle bg-bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="flex items-center gap-2 font-semibold text-fg-primary"><FolderOpen className="h-4 w-4 text-fg-muted" />接続設定</h2><p className="mt-1 text-sm text-fg-muted">CadLinkの出力先とM-BENDをつなぎます。</p></div>
            <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${status == null ? "bg-bg-elevated text-fg-muted" : status.configured ? "bg-emerald-500/10 text-state-success" : "bg-amber-500/10 text-state-warning"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status == null ? "確認中" : status.configured ? "接続設定済み" : "設定が必要"}</span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <PathField label="M-BEND本体" value={status?.mbendRoot} /><PathField label="CadLink出力先" value={status?.importRoot} /><PathField label="連携データ" value={status?.bridgeRoot} /><PathField label="最終マスター同期" value={status?.masterExportedAt} />
          </dl>
          {writable && <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await invoke("mbend:selectFolder", { target: "mbend" }); })}><FolderOpen className="h-4 w-4" /> M-BEND場所</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await invoke("mbend:selectFolder", { target: "import" }); })}><FolderOpen className="h-4 w-4" /> CadLink出力先</Button>
            <Button variant="ghost" disabled={busy || !status?.configured} onClick={() => void run(async () => { const value = await invoke<SheetMetalCamMasterExport>("mbend:exportMasters"); setLastExport(value); toast.push("success", "M-BEND用CAMファイルを出力しました。"); })}><RefreshCw className="h-4 w-4" /> CAMファイル出力</Button>
            <Button disabled={busy || !status?.configured} onClick={() => void run(async () => { await invoke("mbend:launch"); toast.push("success", "M-BENDを起動しました。"); })}><ExternalLink className="h-4 w-4" /> CAMを開く</Button>
          </div>}
          {lastExport && <p className="mt-4 rounded-lg bg-bg-elevated p-3 text-sm text-fg-muted">同期結果: 機械 {lastExport.counts.machines}、上型 {lastExport.counts.upperTools}、下型 {lastExport.counts.lowerTools}、組合せ {lastExport.counts.setups}</p>}
        </section>
        <section id="mbend-masters" className="scroll-mt-24 rounded-2xl border border-border-subtle bg-bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-fg-primary"><Database className="h-4 w-4 text-fg-muted" />機械・金型マスター</h2>
              <p className="mt-1 text-sm text-fg-muted">加工に使う設備・金型と、STEP形状・取付基準を管理します。</p>
            </div>
            {writable && <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
              const value = await invoke<{ machines: number; upperTools: number; lowerTools: number; holders: number }>("mbend:master:importPortal");
              toast.push("success", `共通マスターから移行しました（機械 ${value.machines} / 上型 ${value.upperTools} / 下型 ${value.lowerTools} / ホルダー ${value.holders}）`);
              setMasterRevision((current) => current + 1);
            })}><Database className="h-4 w-4" /> 共通マスターから取り込む</Button>}
          </div>
          <div className="my-5 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="マスターの種類">
            {MASTER_TABS.map((table, index) => { const Icon = [Settings2, ArrowDownToLine, Box, Layers3][index]; return <button key={table} type="button" aria-pressed={masterTable === table} onClick={() => setMasterTable(table)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${masterTable === table ? "border-accent-primary/50 bg-accent-primary/10 text-fg-primary" : "border-border-subtle text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"}`}><Icon className="h-4 w-4 shrink-0" />{MASTER_TABLE_LABELS[table]}</button>; })}
          </div>
          {masterTable !== "m_machines" && <div className="mb-4 flex gap-2">
            <Button variant={masterMode === "basic" ? "primary" : "ghost"} onClick={() => setMasterMode("basic")}>基本情報</Button>
            <Button variant={masterMode === "geometry" ? "primary" : "ghost"} onClick={() => setMasterMode("geometry")}>STEP・取付基準</Button>
          </div>}
          {masterMode === "geometry" && (masterTable === "m_upper_tools" || masterTable === "m_lower_tools" || masterTable === "m_tool_holders")
            ? <MBendGeometryPanel key={`${masterTable}-${masterRevision}`} table={masterTable} canWrite={writable} />
            : <MasterCrud key={`${masterTable}-${masterRevision}`} table={masterTable} canWrite={writable} channelPrefix="mbend:master" />}
        </section>
      </main>
    </div>
  );
}

function PathField({ label, value }: { label: string; value: string | null | undefined }): JSX.Element {
  return <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-base/50 px-4 py-3"><dt className="text-[11px] text-fg-muted">{label}</dt><dd className="mt-2 break-all font-mono text-xs leading-5 text-fg-primary">{value || "未設定"}</dd></div>;
}

/** 装飾用の断面図。加工データやシミュレーション結果ではない。 */
function BendIllustration(): JSX.Element {
  return <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
    <svg viewBox="0 0 440 290" fill="none" className="h-auto w-full">
      <ellipse cx="225" cy="240" rx="160" ry="22" fill="#060f1e" opacity="0.45" />
      <path d="M80 240H366M224 24V251" stroke="#395268" strokeDasharray="4 6" />
      <path d="M154 35H294V74H264L236 128L224 148L212 128L184 74H154Z" fill="#263e55" stroke="#8ab3cb" strokeWidth="1.5" />
      <path d="M154 35L180 21H320L294 35M294 35L320 21V60L294 74H264M236 128L262 114L250 134L224 148" stroke="#8ab3cb" strokeWidth="1.5" />
      <path d="M294 35L320 21V60L294 74H264L236 128L262 114L250 134L224 148L236 128L264 74H294Z" fill="#365970" opacity="0.7" />
      <path d="M127 195H184L224 225L264 195H321V244H127Z" fill="#1b3349" stroke="#8ab3cb" strokeWidth="1.5" />
      <path d="M127 195L153 181H210L224 191L238 181H347V230L321 244M321 195L347 181M184 195L210 181M264 195L290 181" stroke="#8ab3cb" strokeWidth="1.5" />
      <path d="M88 139L224 199L359 139L363 146L224 209L84 146Z" fill="#67e8f9" />
      <path d="M88 139L111 126L224 176L336 126L359 139" stroke="#a5f3fc" strokeWidth="1.5" />
      <path d="M111 126L224 176L336 126L359 139L224 199L88 139Z" fill="#22d3ee" fillOpacity="0.22" />
      <path d="M353 73H385V175M380 80L385 73L390 80M380 168L385 175L390 168" stroke="#67e8f9" strokeOpacity="0.6" />
      <circle cx="224" cy="199" r="5" fill="#cffafe" />
      <path d="M229 199H287L306 165H399" stroke="#67e8f9" strokeOpacity="0.5" />
    </svg>
    <p className="text-center font-mono text-[9px] tracking-[0.22em] text-slate-400">BENDING PROFILE / CONCEPT VIEW</p>
  </div>;
}
