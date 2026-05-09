import { useState, type FormEvent } from "react";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { TextField } from "@renderer/components/ui/TextField.js";

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function ForcePasswordChangeModal({ onSubmit }: Props): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("admin");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("新しいパスワードは 6 文字以上にしてください。");
      return;
    }
    if (newPassword !== confirm) {
      setError("新しいパスワードと確認用が一致しません。");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur">
      <Card className="w-full max-w-md">
        <h2 className="mb-1 text-xl font-semibold">初期パスワードの変更</h2>
        <p className="mb-5 text-sm text-fg-muted">
          セキュリティのため、初回ログイン時はパスワードを変更する必要があります。
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            label="現在のパスワード"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <TextField
            label="新しいパスワード"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <TextField
            label="新しいパスワード（確認）"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && <p className="text-sm text-state-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            {submitting ? "変更中..." : "パスワードを変更してホームへ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
