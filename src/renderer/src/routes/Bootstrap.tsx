import { useState } from "react";
import { Database, FolderOpen, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { SettingsSnapshot } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { invoke } from "@renderer/lib/api.js";

interface Props {
  settings: SettingsSnapshot;
  onUpdated: () => Promise<void>;
}

export function Bootstrap({ settings, onUpdated }: Props): JSX.Element {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(channel: "settings:createNewDatabase" | "settings:pickExistingDatabase") {
    setBusy(true);
    setError(null);
    try {
      const next = await invoke<SettingsSnapshot>(channel);
      await onUpdated();
      if (next.dbPath && next.stage !== "db_unset") {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-6">
      <Card className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-accent-primary/15 p-3">
            <Database size={28} className="text-accent-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">ポータルの初期セットアップ</h1>
            <p className="text-sm text-fg-muted">
              最初にデータベースを接続します。新規作成、または既存の DB を指定してください。
            </p>
          </div>
        </div>

        {settings.dbPath && (
          <p className="mb-4 rounded-lg border border-border-subtle bg-bg-elevated/60 p-3 text-xs text-fg-muted">
            前回の DB: <span className="text-fg-primary">{settings.dbPath}</span>
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => run("settings:createNewDatabase")}
            disabled={busy}
          >
            <Plus size={18} />
            新しいポータル DB を作成
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => run("settings:pickExistingDatabase")}
            disabled={busy}
          >
            <FolderOpen size={18} />
            既存の DB を選択
          </Button>
        </div>

        {error && <p className="mt-4 text-sm text-state-danger">{error}</p>}

        <p className="mt-6 text-xs text-fg-subtle">
          初回作成時には管理者アカウント <span className="text-fg-primary">admin / admin</span> が自動生成され、初回ログインでパスワード変更を求められます。
        </p>
      </Card>
    </div>
  );
}
