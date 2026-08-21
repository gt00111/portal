import type { DetectedBend, ModelAnalysis, Vec3 } from "@shared/sheetMetalSupport.js";

/** 判断エンジンが形状解析結果を扱うための幾何ヘルパー。 */

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 2 本の曲げ軸（無限直線）の距離。平行・ねじれのどちらにも対応する。 */
export function axisDistance(a: DetectedBend, b: DetectedBend): number {
  const between = sub(b.axisStart, a.axisStart);
  const n = cross(a.axisDir, b.axisDir);
  const nLength = length(n);
  if (nLength < 1e-6) {
    // 平行: 軸方向成分を除いた残りが距離
    const along = dot(between, a.axisDir);
    return length(sub(between, scale(a.axisDir, along)));
  }
  return Math.abs(dot(between, n)) / nLength;
}

/** 2 本の曲げ軸が同一方向とみなせるか（向きの正負は問わない） */
export function isParallel(a: DetectedBend, b: DetectedBend, toleranceDeg = 5): boolean {
  const limit = Math.cos((toleranceDeg * Math.PI) / 180);
  return Math.abs(dot(a.axisDir, b.axisDir)) >= limit;
}

/**
 * 推定フランジ長。
 * 曲げ線（無限直線）から外形境界箱の最も近い角までの垂直距離を用いる。
 * 単純な L 曲げでは短い側のフランジ長に一致する。展開形状は持たないため概算。
 */
export function estimateFlangeLength(bend: DetectedBend, analysis: ModelAnalysis): number | null {
  const box = analysis.boundingBox;
  if (!box) return null;

  let nearest = Number.POSITIVE_INFINITY;
  for (let corner = 0; corner < 8; corner++) {
    const point: Vec3 = [
      corner & 1 ? box.max[0] : box.min[0],
      corner & 2 ? box.max[1] : box.min[1],
      corner & 4 ? box.max[2] : box.min[2],
    ];
    const relative = sub(point, bend.axisStart);
    const along = dot(relative, bend.axisDir);
    const perpendicular = length(sub(relative, scale(bend.axisDir, along)));
    nearest = Math.min(nearest, perpendicular);
  }
  return Number.isFinite(nearest) ? round1(nearest) : null;
}
