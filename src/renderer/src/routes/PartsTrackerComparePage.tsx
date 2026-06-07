import { HelpCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getPartsTrackerAppRole } from "@shared/partsTrackerAuth.js";

import type { BomDiffResult } from "@shared/bomDiff.js";
import type { PartsTrackerProjectOption } from "@shared/partsTracker.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { PartsTrackerHelpContent } from "@renderer/routes/parts-tracker/PartsTrackerHelpContent.js";
import { invoke } from "@renderer/lib/api.js";
import { BomDiffResultPanel } from "@renderer/routes/parts-tracker/BomDiffResultPanel.js";
import { ProjectCascadeSelect } from "@renderer/routes/parts-tracker/ProjectCascadeSelect.js";
import { findLatestPastProject } from "@renderer/routes/parts-tracker/projectCascade.js";

interface Props {
  session: SessionUser;
}

export function PartsTrackerComparePage({ session }: Props): JSX.Element {
  const toast = useToast();
  const appRole = getPartsTrackerAppRole(session);
  const [helpOpen, setHelpOpen] = useState(false);
  const [projects, setProjects] = useState<PartsTrackerProjectOption[]>([]);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [projectIdA, setProjectIdA] = useState("");
  const [projectIdB, setProjectIdB] = useState("");
  const [diffResult, setDiffResult] = useState<BomDiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);
  const [matchByPath, setMatchByPath] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const list = await invoke<PartsTrackerProjectOption[]>("parts-tracker:projectList");
      setProjects(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }, [toast]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const projectB = useMemo(
    () => projects.find((p) => p.id === projectIdB) ?? null,
    [projects, projectIdB]
  );

  const applySuggestedSource = useCallback(() => {
    if (!projectB) {
      toast.push("info", "先に比較先（今回）の案件を選んでください。");
      return;
    }
    const past = findLatestPastProject(projects, projectB.id, projectB.partNumber);
    if (!past) {
      toast.push("info", "同一親番の過去案件が見つかりません。");
      return;
    }
    setProjectIdA(past.id);
  }, [projectB, projects, toast]);

  const runCompare = useCallback(async () => {
    if (!projectIdA || !projectIdB) {
      toast.push("info", "比較元・比較先の両方の案件を選択してください。");
      return;
    }
    setDiffBusy(true);
    setDiffResult(null);
    try {
      const res = await invoke<BomDiffResult>("parts-tracker:bomDiff:project", {
        seisanProjectIdA: projectIdA,
        seisanProjectIdB: projectIdB,
        matchByAssemblyPath: matchByPath,
      });
      setDiffResult(res);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setDiffBusy(false);
    }
  }, [projectIdA, projectIdB, matchByPath, toast]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <div className="w-full space-y-4 px-3 py-4 sm:px-4">
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={16} aria-hidden />
            ヘルプ
          </Button>
        </div>

        <Card className="space-y-6 p-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-primary">比較先（今回）</h2>
            </div>
            <ProjectCascadeSelect
              projects={projects}
              value={projectIdB}
              onChange={setProjectIdB}
              searchQuery={searchB}
              onSearchQueryChange={setSearchB}
            />
          </div>

          <div className="space-y-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-primary">比較元（前回）</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!projectIdB}
                onClick={applySuggestedSource}
              >
                前回候補を自動セット
              </Button>
            </div>
            <ProjectCascadeSelect
              projects={projects}
              value={projectIdA}
              onChange={setProjectIdA}
              searchQuery={searchA}
              onSearchQueryChange={setSearchA}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-4">
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={changesOnly}
                onChange={(e) => setChangesOnly(e.target.checked)}
                className="rounded border-border-strong"
              />
              変更ありのみ表示
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={matchByPath}
                onChange={(e) => setMatchByPath(e.target.checked)}
                className="rounded border-border-strong"
              />
              組立パスでマッチング
            </label>
            <Button
              type="button"
              disabled={diffBusy || !projectIdA || !projectIdB}
              onClick={() => void runCompare()}
            >
              {diffBusy ? "比較中..." : "差分を表示"}
            </Button>
          </div>
        </Card>

        {diffResult && (
          <Card className="p-4">
            <BomDiffResultPanel result={diffResult} changesOnly={changesOnly} />
          </Card>
        )}
      </div>

      <Modal open={helpOpen} title="案件間比較のヘルプ" onClose={() => setHelpOpen(false)} width="lg">
        <PartsTrackerHelpContent variant="compare" appRole={appRole} />
      </Modal>
    </main>
  );
}
