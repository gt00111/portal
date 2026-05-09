import { useNavigate } from "react-router-dom";

import { Button } from "@renderer/components/ui/Button.js";

export function NotFound(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-base p-6">
      <p className="text-6xl font-bold text-fg-subtle">404</p>
      <p className="text-fg-muted">画面が見つかりませんでした。</p>
      <Button variant="secondary" size="md" onClick={() => navigate("/", { replace: true })}>
        トップへ戻る
      </Button>
    </div>
  );
}
