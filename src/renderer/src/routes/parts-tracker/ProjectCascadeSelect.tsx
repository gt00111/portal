import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PartsTrackerProjectOption } from "@shared/partsTracker.js";

import { Select } from "@renderer/components/ui/Select.js";
import {
  filterProjectsBySearch,
  partNumberLabel,
  projectCascadeLabel,
  projectsInCascade,
  resolveCascadeFromProjectId,
  uniqueCompanies,
  uniquePartNumbers,
} from "@renderer/routes/parts-tracker/projectCascade.js";

interface Props {
  projects: PartsTrackerProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  disabled?: boolean;
  /** 変更前に false を返すとキャンセル */
  beforeChange?: (nextProjectId: string) => boolean;
}

export function ProjectCascadeSelect({
  projects,
  value,
  onChange,
  searchQuery = "",
  onSearchQueryChange,
  disabled = false,
  beforeChange,
}: Props): JSX.Element {
  const filtered = useMemo(
    () => filterProjectsBySearch(projects, searchQuery),
    [projects, searchQuery]
  );

  const companies = useMemo(() => uniqueCompanies(filtered), [filtered]);

  const [companyName, setCompanyName] = useState("");
  const [partKey, setPartKey] = useState("");

  useEffect(() => {
    if (!value) return;
    const resolved = resolveCascadeFromProjectId(filtered, value);
    if (resolved) {
      setCompanyName(resolved.companyName);
      setPartKey(resolved.partNumberKey);
    }
  }, [value, filtered]);

  const partNumbers = useMemo(() => {
    if (!companyName) return [];
    return uniquePartNumbers(filtered, companyName);
  }, [filtered, companyName]);

  const cascadeProjects = useMemo(() => {
    if (!companyName || !partKey) return [];
    return projectsInCascade(filtered, companyName, partKey);
  }, [filtered, companyName, partKey]);

  const applyProjectId = useCallback(
    (nextId: string) => {
      if (beforeChange && !beforeChange(nextId)) return;
      onChange(nextId);
    },
    [beforeChange, onChange]
  );

  const handleCompanyChange = (cn: string) => {
    setCompanyName(cn);
    setPartKey("");
    onChange("");
  };

  const handlePartNumberChange = (pk: string) => {
    setPartKey(pk);
    const list = projectsInCascade(filtered, companyName, pk);
    if (list.length === 1) {
      applyProjectId(list[0].id);
    } else {
      onChange("");
    }
  };

  const stage2Disabled = disabled || !companyName;
  const stage3Disabled = disabled || !companyName || !partKey;

  return (
    <div className="space-y-3">
      {onSearchQueryChange && (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            placeholder="製番・案件名・客先（補助検索）"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-50"
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label="客先"
          value={companyName}
          onChange={(e) => handleCompanyChange(e.target.value)}
          disabled={disabled}
          options={[
            { value: "", label: "（客先を選択）" },
            ...companies.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          label="親番（製品品番）"
          value={partKey}
          onChange={(e) => handlePartNumberChange(e.target.value)}
          disabled={stage2Disabled}
          options={[
            { value: "", label: stage2Disabled ? "—" : "（親番を選択）" },
            ...partNumbers.map((k) => ({ value: k, label: partNumberLabel(k) })),
          ]}
        />
        <Select
          label="案件"
          value={value}
          onChange={(e) => applyProjectId(e.target.value)}
          disabled={stage3Disabled}
          options={[
            { value: "", label: stage3Disabled ? "—" : "（案件を選択）" },
            ...cascadeProjects.map((p) => ({
              value: p.id,
              label: projectCascadeLabel(p),
            })),
          ]}
        />
      </div>
    </div>
  );
}
