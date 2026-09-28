export interface SheetMetalCamStatus {
  mbendRoot: string | null;
  importRoot: string | null;
  bridgeRoot: string;
  configured: boolean;
  masterExportedAt: string | null;
}

export interface SheetMetalCamMasterExport {
  bridgeRoot: string;
  configPath: string;
  exportedAt: string;
  counts: {
    machines: number;
    upperTools: number;
    lowerTools: number;
    setups: number;
  };
  warnings: string[];
}

export interface SheetMetalCamLaunchResult {
  launched: true;
  processId: number;
  logPath: string;
}

export interface SheetMetalCamResult {
  partNumber: string;
  status: string;
  level: string | null;
  summary: string | null;
  simulatedAt: string | null;
  collisionCount: number;
  warningCount: number;
  importedAt: string;
  sourceFiles: string[];
  machineName: string | null;
  upperToolName: string | null;
  lowerToolName: string | null;
  materialLabel: string | null;
  thicknessMm: number | null;
  recommendedVWidthMm: number | null;
  bends: SheetMetalCamBendCondition[];
}

export interface SheetMetalCamBendCondition {
  sequence: number | null;
  bendId: string;
  angleDeg: number | null;
  innerRadiusMm: number | null;
  upperToolName: string | null;
  lowerToolName: string | null;
  status: string | null;
  reason: string | null;
}
