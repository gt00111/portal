import { useEffect, useState } from "react";

import {
  WELDING_PROCESS_TEMPLATE_NAME_DEFAULT,
  type WeldingProcessTemplateMapping,
} from "@shared/partsTrackerWeldingDate.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";

export function WeldingProcessMappingModal({
  open,
  mapping,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  mapping: WeldingProcessTemplateMapping | null;
  onClose: () => void;
  onSubmit: (input: { processTemplateName: string }) => void;
  submitting: boolean;
}): JSX.Element | null {
  const [templateName, setTemplateName] = useState(WELDING_PROCESS_TEMPLATE_NAME_DEFAULT);

  useEffect(() => {
    if (!open || !mapping) return;
    setTemplateName(mapping.processTemplateName);
  }, [open, mapping]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="溶接工程マッピング">
      <p className="mb-3 text-xs text-fg-muted">
        生産ボードの工程テンプレートと部材管理の必要着日（溶接開始日）を対応付けます。未設定時は既定値（溶接
        / pt05）を使用します。
      </p>
      <label className="block text-xs text-fg-subtle">必要着日の基準工程（溶接）</label>
      <input
        className="mt-1 w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm"
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
        maxLength={120}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || !templateName.trim()}
          onClick={() => onSubmit({ processTemplateName: templateName.trim() })}
        >
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Modal>
  );
}
