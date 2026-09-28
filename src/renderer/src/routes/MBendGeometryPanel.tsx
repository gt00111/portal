import { useEffect, useRef, useState } from "react";
import type { MasterRow } from "@shared/master.js";
import { defaultPlacement, validatePlacement, type GeometryTable, type ToolGeometry, type ToolPlacement } from "@shared/mBendGeometry.js";
import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { StepViewer, type StepViewerHandle } from "@renderer/routes/sheet-metal-support/StepViewer.js";

export function MBendGeometryPanel({ table, canWrite }: { table: GeometryTable; canWrite: boolean }): JSX.Element {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void invoke<MasterRow[]>("mbend:master:list", { table }).then((data) => {
      if (active) setRows(data);
    }).catch((err: unknown) => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, [table]);
  return <div className="space-y-4">
    <p className="text-sm text-fg-muted">登録済みの金型を選択してSTEPと取付基準を設定します。未登録の場合は「基本情報」で先に追加してください。</p>
    {error && <p role="alert" className="text-state-danger">{error}</p>}
    <label className="block space-y-1 text-sm text-fg-primary">対象の金型
      <select value={id} onChange={(e) => setId(e.target.value)} className="block h-10 w-full rounded-lg border border-border-strong bg-bg-surface px-3 text-fg-primary">
        <option value="">選択してください</option>
        {rows.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}{r.isActive ? "" : "（無効）"}</option>)}
      </select>
    </label>
    {id && <GeometryEditor key={`${table}-${id}`} table={table} id={Number(id)} canWrite={canWrite} />}
  </div>;
}

function GeometryEditor({ table, id, canWrite }: { table: GeometryTable; id: number; canWrite: boolean }): JSX.Element {
  const toast = useToast();
  const viewer = useRef<StepViewerHandle>(null);
  const [geometry, setGeometry] = useState<ToolGeometry | null>(null);
  const [placement, setPlacement] = useState<ToolPlacement>(defaultPlacement);
  const [preview, setPreview] = useState<ToolPlacement>(defaultPlacement);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [reload, setReload] = useState(0);
  const dirty = geometry && JSON.stringify(placement) !== JSON.stringify(geometry.placement);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setGeometry(null); setBytes(null);
    void (async () => {
      const value = await invoke<ToolGeometry>("mbend:geometry:get", { table, id });
      if (!active) return;
      setGeometry(value); setPlacement(value.placement); setPreview(value.placement);
      if (value.relativePath) {
        const model = await invoke<{ base64: string }>("mbend:geometry:read", { table, id });
        if (active) setBytes(Uint8Array.from(atob(model.base64), (c) => c.charCodeAt(0)));
      }
    })().catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [table, id, reload]);

  async function upload(): Promise<void> {
    if (!geometry) return;
    setConfirmImport(false); setBusy(true); setError("");
    try {
      const result = await invoke<ToolGeometry | null>("mbend:geometry:import", { table, id, revision: geometry.revision });
      if (result) { setReload((v) => v + 1); toast.push("success", "STEPを登録しました。基準位置を確認してください。"); }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function save(): Promise<void> {
    if (!geometry) return;
    setBusy(true); setError("");
    try {
      validatePlacement(placement);
      const result = await invoke<ToolGeometry>("mbend:geometry:save", { table, id, revision: geometry.revision, placement });
      setGeometry(result); setPreview(result.placement); toast.push("success", "取付基準を保存しました。");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const anchorLabel = table === "m_upper_tools" ? "先端中心" : table === "m_lower_tools" ? "V溝中心" : "金型中心";
  const groups: [keyof ToolPlacement, string][] = [
    ["anchor", `${anchorLabel}（元モデル座標・mm）`],
    ["mountPoint", table === "m_lower_tools" ? "上面上の基準点（元モデル座標・mm）" : "取付面上の基準点（元モデル座標・mm）"],
    ["mountNormal", "基準面の法線方向（元モデル座標）"],
    ["rotationDeg", "モデルの向き：X → Y → Z回転（度）"],
    ["offset", "位置補正（回転後の座標・mm）"],
  ];
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="break-all text-sm text-fg-primary">STEP: {geometry?.fileName ?? "未登録"} {dirty && "／未保存の変更あり"}</p>
      {canWrite && <Button disabled={busy || !geometry} onClick={() => geometry?.relativePath || dirty ? setConfirmImport(true) : void upload()}>STEPを選択して登録</Button>}
    </div>
    <p className="text-sm text-fg-muted">座標はmm。X＝金型長さ、Y＝バックゲージ側、Z＝上方向。基準点を原点へ移し、回転後に位置補正を適用します。紫の矢印は基準面の法線です。現段階では形状確認用で、干渉判定には未使用です。</p>
    {error && <p role="alert" className="text-sm text-state-danger">{error}</p>}
    {busy && <p role="status" className="text-sm text-fg-muted">処理中…</p>}
    {bytes && <>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => viewer.current?.fit()}>画面に合わせる</Button>
        <Button variant="ghost" onClick={() => viewer.current?.setView("front")}>正面</Button>
        <Button variant="ghost" onClick={() => viewer.current?.setView("iso")}>立体</Button>
      </div>
      <StepViewer ref={viewer} bytes={bytes} detectBends={false} showBendLines={false} placement={preview} />
      <p className="text-sm text-fg-muted">座標軸：X＝赤、Y＝緑、Z＝青。入力後に「3Dに反映」でプレビューを更新します。</p>
    </>}
    <fieldset disabled={busy || !canWrite || !geometry} className="grid gap-4 md:grid-cols-2">
      {groups.map(([key, label]) => <div key={key} className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm text-fg-primary">{label}</p>
        <div className="grid grid-cols-3 gap-2">{["X", "Y", "Z"].map((axis, i) => <label key={axis} className="text-sm text-fg-muted">{axis}
          <input aria-label={`${label} ${axis}`} type="number" step="any" value={Number.isNaN(placement[key][i]) ? "" : placement[key][i]}
            onChange={(e) => setPlacement((current) => { const next = { ...current, [key]: [...current[key]] }; next[key][i] = e.target.value === "" ? NaN : Number(e.target.value); return next; })}
            className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary" />
        </label>)}</div>
      </div>)}
    </fieldset>
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" disabled={busy || Boolean(dirty)} onClick={() => setReload((v) => v + 1)}>再読込</Button>
      <Button variant="ghost" disabled={busy || !geometry} onClick={() => { setPlacement(geometry!.placement); setPreview(geometry!.placement); }}>変更を戻す</Button>
      <Button variant="ghost" disabled={busy || !bytes} onClick={() => { try { validatePlacement(placement); setPreview(structuredClone(placement)); setError(""); } catch (err) { setError(String(err)); } }}>3Dに反映</Button>
      {canWrite && <Button disabled={busy || !geometry} onClick={() => void save()}>基準位置を保存</Button>}
    </div>
    <Modal open={confirmImport} onClose={() => setConfirmImport(false)} title="STEPの登録・差し替え">
      <p className="text-sm text-fg-primary">新しい形状を登録すると基準位置・回転・補正を初期化します。同じファイルなら保存済み設定を保持します。未保存の入力は失われます。旧STEPファイルは保存先に残ります。</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmImport(false)}>キャンセル</Button><Button onClick={() => void upload()}>ファイルを選択</Button></div>
    </Modal>
  </section>;
}
