import { useState, type FormEvent } from "react";
import { Shield } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { TextField } from "@renderer/components/ui/TextField.js";

interface Props {
  dbPath: string | null;
  onLogin: (username: string, password: string) => Promise<SessionUser>;
  onReconfigureDb: () => void;
}

export function Login({ dbPath, onLogin, onReconfigureDb }: Props): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(username.trim(), password);
      const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/home";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-6">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-accent-primary/15 p-3">
            <Shield size={26} className="text-accent-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">ログイン</h1>
            <p className="text-sm text-fg-muted">統合ポータルへようこそ。</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            label="ユーザー名"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <TextField
            label="パスワード"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-state-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            {submitting ? "ログイン中..." : "ログイン"}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-xs text-fg-subtle sm:flex-row sm:items-start sm:justify-between">
          <span className="min-w-0 break-all sm:max-w-[65%]">DB: {dbPath ?? "(未接続)"}</span>
          <button
            type="button"
            onClick={onReconfigureDb}
            className="text-fg-muted underline-offset-4 hover:text-fg-primary hover:underline"
          >
            DB を切り替える
          </button>
        </div>
      </Card>
    </div>
  );
}
