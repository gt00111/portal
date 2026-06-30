import { Image as ImageIcon, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { SettingsSnapshot } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface Props {
  settings: SettingsSnapshot;
  onUpdated: () => Promise<void>;
}

export function AdminSettings({ settings, onUpdated }: Props): JSX.Element {
  const toast = useToast();
  const [companyName, setCompanyName] = useState(settings.company.companyName);
  const [mottos, setMottos] = useState<string[]>(settings.company.mottos);
  const [heroBgPath, setHeroBgPath] = useState<string | null>(settings.company.homeHeroBackgroundPath);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCompanyName(settings.company.companyName);
    setMottos(settings.company.mottos);
    setHeroBgPath(settings.company.homeHeroBackgroundPath);
  }, [settings]);

  function setMotto(index: number, value: string): void {
    setMottos((prev) => prev.map((m, i) => (i === index ? value : m)));
  }
  function addMotto(): void {
    setMottos((prev) => [...prev, ""]);
  }
  function removeMotto(index: number): void {
    setMottos((prev) => prev.filter((_, i) => i !== index));
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await invoke<SettingsSnapshot>("settings:updateCompanyInfo", {
        companyName,
        mottos: mottos.map((m) => m.trim()).filter((m) => m.length > 0),
        homeHeroBackgroundPath: heroBgPath,
      });
      await onUpdated();
      toast.push("success", "会社情報を保存しました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function pickHeroBg(): Promise<void> {
    try {
      const res = await invoke<{ path: string | null }>("settings:pickHomeLpImage");
      if (res.path) setHeroBgPath(res.path);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function changeDb(channel: "settings:pickExistingDatabase" | "settings:createNewDatabase"): Promise<void> {
    try {
      await invoke<SettingsSnapshot>(channel);
      await onUpdated();
      toast.push("info", "DB を切り替えました。再ログインが必要な場合があります。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">設定</h1>
        <p className="text-sm text-fg-muted">
          ポータルのトップに表示される会社名・モットー・ヒーロー背景画像、および接続中のデータベースを管理します。
        </p>
      </header>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">会社情報</h2>
        <div className="flex flex-col gap-4">
          <TextField
            label="会社名"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="例：株式会社サンプル"
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm text-fg-muted">モットー（順番にホームのカルーセルで表示）</span>
            {mottos.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-xs text-fg-subtle">{idx + 1}.</span>
                <input
                  type="text"
                  value={m}
                  onChange={(e) => setMotto(idx, e.target.value)}
                  placeholder="例：安全 第一"
                  className="h-10 flex-1 rounded-lg border border-border-strong bg-bg-surface px-3 text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                />
                <Button variant="ghost" size="sm" onClick={() => removeMotto(idx)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" className="self-start" onClick={addMotto}>
              <Plus size={16} />
              モットーを追加
            </Button>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-elevated/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ImageIcon size={18} className="shrink-0 text-accent-secondary" aria-hidden />
              <span className="text-sm font-medium text-fg-primary">ヒーロー背景（会社名エリア）</span>
            </div>
            <p className="text-xs text-fg-muted">
              未設定のときはコード既定またはグラデーションのみです。PNG / JPG / WebP など。
              保存時に中央 DB と同じ共有フォルダの <code className="rounded bg-muted px-1">assets/</code> へコピーされ、全 PC から参照できます。
            </p>
            <p className="break-all rounded-md border border-border-subtle bg-bg-surface px-3 py-2 font-mono text-xs text-fg-muted">
              {heroBgPath ?? "（未設定）"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void pickHeroBg()}>
                ファイルを選択
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!heroBgPath}
                onClick={() => setHeroBgPath(null)}
              >
                クリア
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={saving}>
              <Save size={16} />
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">データベース</h2>
        <p className="mb-4 text-sm text-fg-muted">
          現在接続中のポータル DB ファイル。切替や新規作成は再ログインが必要になる場合があります。
        </p>
        <p className="mb-4 break-all rounded-lg border border-border-subtle bg-bg-elevated/60 p-3 font-mono text-xs text-fg-primary">
          {settings.dbPath ?? "(未接続)"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => changeDb("settings:pickExistingDatabase")}
          >
            既存 DB を選択
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => changeDb("settings:createNewDatabase")}
          >
            新規 DB を作成
          </Button>
        </div>
      </Card>
    </div>
  );
}
