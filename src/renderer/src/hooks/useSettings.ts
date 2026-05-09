import { useCallback, useEffect, useState } from "react";

import type { SettingsSnapshot } from "@shared/types.js";

import { invoke } from "@renderer/lib/api.js";

interface UseSettings {
  settings: SettingsSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await invoke<SettingsSnapshot>("settings:get");
      setSettings(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { settings, loading, error, refresh };
}
