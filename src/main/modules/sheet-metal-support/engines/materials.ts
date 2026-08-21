/**
 * 材質定義（判断エンジンの計算定数）。
 * 加工条件の材質はフリーテキストのため、表記ゆれを正規化して代表材質に解決する。
 * 解決できない場合は軟鋼相当の既定値を用い、判断理由にその旨を明記する。
 */

export interface MaterialSpec {
  /** 正規化キー */
  key: string;
  label: string;
  /** 引張強さ（N/mm²）。曲げ荷重の算出に使用 */
  tensileStrength: number;
  /** 最小内側曲げ R = 係数 × 板厚 */
  minBendRadiusFactor: number;
  /** 内側曲げ R ≒ 係数 × ダイ V 幅 */
  vRadiusFactor: number;
}

/** 材質未解決時の既定値（軟鋼相当・安全側） */
export const DEFAULT_MATERIAL: MaterialSpec = {
  key: "DEFAULT",
  label: "軟鋼相当（既定）",
  tensileStrength: 400,
  minBendRadiusFactor: 0.8,
  vRadiusFactor: 0.16,
};

/** 代表材質。`aliases` は正規化後の文字列に対する前方一致で判定する。 */
const MATERIALS: ReadonlyArray<MaterialSpec & { aliases: string[] }> = [
  {
    key: "SPCC",
    label: "SPCC（冷間圧延鋼板）",
    tensileStrength: 320,
    minBendRadiusFactor: 0.5,
    vRadiusFactor: 0.16,
    aliases: ["SPCC", "SPCE", "SPCD"],
  },
  {
    key: "SPHC",
    label: "SPHC（熱間圧延鋼板）",
    tensileStrength: 340,
    minBendRadiusFactor: 0.5,
    vRadiusFactor: 0.16,
    aliases: ["SPHC", "SPHD", "SPHE"],
  },
  {
    key: "SECC",
    label: "SECC（電気亜鉛めっき鋼板）",
    tensileStrength: 320,
    minBendRadiusFactor: 0.6,
    vRadiusFactor: 0.16,
    aliases: ["SECC", "SECD"],
  },
  {
    key: "SGCC",
    label: "SGCC（溶融亜鉛めっき鋼板）",
    tensileStrength: 340,
    minBendRadiusFactor: 0.6,
    vRadiusFactor: 0.16,
    aliases: ["SGCC", "SGHC"],
  },
  {
    key: "SS400",
    label: "SS400（一般構造用圧延鋼材）",
    tensileStrength: 420,
    minBendRadiusFactor: 1.0,
    vRadiusFactor: 0.16,
    aliases: ["SS400", "SS41", "SM400"],
  },
  {
    key: "SUS304",
    label: "SUS304（オーステナイト系ステンレス）",
    tensileStrength: 620,
    minBendRadiusFactor: 0.5,
    vRadiusFactor: 0.17,
    aliases: ["SUS304", "SUS316", "SUS301"],
  },
  {
    key: "SUS430",
    label: "SUS430（フェライト系ステンレス）",
    tensileStrength: 450,
    minBendRadiusFactor: 1.0,
    vRadiusFactor: 0.17,
    aliases: ["SUS430", "SUS410", "SUS420"],
  },
  {
    key: "A5052",
    label: "A5052（アルミ合金）",
    tensileStrength: 230,
    minBendRadiusFactor: 1.0,
    vRadiusFactor: 0.15,
    aliases: ["A5052", "AL5052", "5052"],
  },
  {
    key: "A1050",
    label: "A1050（純アルミ）",
    tensileStrength: 90,
    minBendRadiusFactor: 0.3,
    vRadiusFactor: 0.15,
    aliases: ["A1050", "A1100", "AL1050", "AL1100"],
  },
  {
    key: "C1100",
    label: "C1100（タフピッチ銅）",
    tensileStrength: 220,
    minBendRadiusFactor: 0.5,
    vRadiusFactor: 0.15,
    aliases: ["C1100", "C1020", "C2801"],
  },
];

/** 記号・空白を除去して大文字化する（例: "sus-304 t1.6" → "SUS304T1.6"） */
function normalize(input: string): string {
  return input.toUpperCase().replace(/[\s\-_/（）()]/g, "");
}

export interface MaterialLookup {
  spec: MaterialSpec;
  /** 代表材質に解決できたか（false なら既定値を使用） */
  resolved: boolean;
}

export function lookupMaterial(material: string | null | undefined): MaterialLookup {
  const raw = material?.trim();
  if (!raw) return { spec: DEFAULT_MATERIAL, resolved: false };

  const normalized = normalize(raw);
  for (const entry of MATERIALS) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) {
      const { aliases: _aliases, ...spec } = entry;
      return { spec, resolved: true };
    }
  }
  return { spec: DEFAULT_MATERIAL, resolved: false };
}
