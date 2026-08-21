import type { OcctMesh } from "occt-import-js";

import type {
  BendConfidence,
  CylinderBreakdown,
  DetectedBend,
  ModelAnalysis,
  ThicknessSource,
  Vec3,
} from "@shared/sheetMetalSupport.js";

/**
 * STEP メッシュからの曲げ線検出（Phase 4）。
 *
 * occt-import-js は三角形範囲を元の BREP 面（`brep_faces`）単位で返すため、
 * 面ごとに「平面か円筒か」を判定できる。板金の曲げ部は円筒面として現れるので、
 * 円筒面の軸・半径・回転角を推定し、内側／外側の円筒対から板厚も求める。
 *
 * ただし円筒面は曲げ以外にも現れる（外形のコーナーR・穴・面取りR）ため、
 * 検出した円筒を板厚を基準に分類してから曲げを確定させる。判別の要点は向きで、
 * 外形コーナーRは板厚方向に立った円筒なので軸方向の長さが板厚と等しくなり、
 * 曲げは板面に沿って寝た円筒なので軸方向の長さが曲げ線の長さになる。
 *
 * three.js に依存しない純粋な幾何計算のみで構成する（将来メイン側へ移設可能にするため）。
 */

export type { DetectedBend, ModelAnalysis } from "@shared/sheetMetalSupport.js";

/* -------------------- ベクトル -------------------- */

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : [0, 0, 0];
}

/** 与えた軸に直交する正規直交基底を作る */
function basisFor(axis: Vec3): { u: Vec3; v: Vec3 } {
  const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(axis, seed));
  const v = normalize(cross(axis, u));
  return { u, v };
}

/* -------------------- 固有値分解（対称 3x3・Jacobi 法） -------------------- */

function jacobiEigen(input: number[][]): { values: number[]; vectors: Vec3[] } {
  const a = input.map((row) => [...row]);
  let v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let sweep = 0; sweep < 24; sweep++) {
    const off = a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2];
    if (off < 1e-18) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-20) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [
      [v[0][0], v[1][0], v[2][0]],
      [v[0][1], v[1][1], v[2][1]],
      [v[0][2], v[1][2], v[2][2]],
    ],
  };
}

/* -------------------- 円フィッティング（Kåsa 法） -------------------- */

interface CircleFit {
  cx: number;
  cy: number;
  radius: number;
  maxResidual: number;
}

function solve3x3(m: number[][], rhs: number[]): number[] | null {
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < 4; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function fitCircle(points: ReadonlyArray<readonly [number, number]>): CircleFit | null {
  if (points.length < 3) return null;
  // 数値安定化のため重心を原点へ寄せる
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= points.length;
  my /= points.length;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sx = 0;
  let sy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const [px, py] of points) {
    const x = px - mx;
    const y = py - my;
    const z = x * x + y * y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sx += x;
    sy += y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  const solution = solve3x3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, points.length],
    ],
    [-sxz, -syz, -sz]
  );
  if (!solution) return null;
  const [d, e, f] = solution;
  const cx = -d / 2;
  const cy = -e / 2;
  const inner = (d * d + e * e) / 4 - f;
  if (inner <= 0) return null;
  const radius = Math.sqrt(inner);

  let maxResidual = 0;
  for (const [px, py] of points) {
    const x = px - mx - cx;
    const y = py - my - cy;
    maxResidual = Math.max(maxResidual, Math.abs(Math.sqrt(x * x + y * y) - radius));
  }
  return { cx: cx + mx, cy: cy + my, radius, maxResidual };
}

/**
 * 角度（度）の集合が占める範囲。最大の空きを全周から引く。
 * 穴のような閉じた輪郭では最大の空きが分割間隔と同程度になるため、全周 360° として扱う。
 */
function angularSpanDeg(anglesDeg: number[]): number {
  if (anglesDeg.length < 3) return 0;
  const sorted = [...anglesDeg].sort((a, b) => a - b);
  const gaps: number[] = [360 - (sorted[sorted.length - 1] - sorted[0])];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  // 同一角度の重複頂点（分割線の両端）は間隔とみなさない
  const spacing = gaps.filter((g) => g > 1e-6).sort((a, b) => a - b);
  if (spacing.length === 0) return 0;
  const largest = spacing[spacing.length - 1];
  const medianGap = spacing[Math.floor(spacing.length / 2)];
  if (largest <= Math.max(medianGap * 2.5, medianGap + 0.5)) return 360;
  return 360 - largest;
}

/* -------------------- 円筒面の抽出 -------------------- */

/** 平面とみなす法線ばらつき（度） */
const PLANAR_TOLERANCE_DEG = 2;
/** 円筒とみなす軸方向成分の許容（度） */
const AXIS_TOLERANCE_DEG = 6;
/** 全周（穴）とみなす回転角（度） */
const FULL_CIRCLE_DEG = 350;

interface CylinderFace {
  axis: Vec3;
  /** 軸線上で原点に最も近い点（軸の位置を基底に依らず表す） */
  axisPoint: Vec3;
  radius: number;
  spanDeg: number;
  /** 軸方向のパラメータ範囲 */
  tMin: number;
  tMax: number;
}

function fitCylinderFace(
  position: ArrayLike<number>,
  index: ArrayLike<number>,
  firstTriangle: number,
  lastTriangle: number
): CylinderFace | null {
  const triangleCount = lastTriangle - firstTriangle + 1;
  if (triangleCount < 2) return null;

  const normals: Vec3[] = [];
  const weights: number[] = [];
  const vertexIds = new Set<number>();

  for (let t = firstTriangle; t <= lastTriangle; t++) {
    const i0 = index[t * 3];
    const i1 = index[t * 3 + 1];
    const i2 = index[t * 3 + 2];
    if (i0 == null || i1 == null || i2 == null) return null;
    vertexIds.add(i0);
    vertexIds.add(i1);
    vertexIds.add(i2);

    const p0: Vec3 = [position[i0 * 3], position[i0 * 3 + 1], position[i0 * 3 + 2]];
    const p1: Vec3 = [position[i1 * 3], position[i1 * 3 + 1], position[i1 * 3 + 2]];
    const p2: Vec3 = [position[i2 * 3], position[i2 * 3 + 1], position[i2 * 3 + 2]];
    const raw = cross(sub(p1, p0), sub(p2, p0));
    const area = length(raw) / 2;
    if (area <= 1e-12) continue;
    normals.push(scale(raw, 1 / (area * 2)));
    weights.push(area);
  }
  if (normals.length < 2) return null;

  // 面全体の平均法線から外れが小さければ平面
  let average: Vec3 = [0, 0, 0];
  for (let i = 0; i < normals.length; i++) {
    average = add(average, scale(normals[i], weights[i]));
  }
  average = normalize(average);
  const planarLimit = Math.cos((PLANAR_TOLERANCE_DEG * Math.PI) / 180);
  let minAlignment = 1;
  for (const n of normals) minAlignment = Math.min(minAlignment, dot(n, average));
  if (minAlignment > planarLimit) return null;

  // 円筒面では全法線が軸と直交する → 法線共分散の最小固有ベクトルが軸
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < normals.length; i++) {
    const n = normals[i];
    const w = weights[i];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) cov[r][c] += w * n[r] * n[c];
    }
  }
  const { values, vectors } = jacobiEigen(cov);
  let smallest = 0;
  for (let i = 1; i < 3; i++) if (values[i] < values[smallest]) smallest = i;
  const axis = normalize(vectors[smallest]);
  if (length(axis) === 0) return null;

  const axisLimit = Math.sin((AXIS_TOLERANCE_DEG * Math.PI) / 180);
  for (const n of normals) {
    if (Math.abs(dot(n, axis)) > axisLimit) return null;
  }

  const { u, v } = basisFor(axis);
  const projected: Array<[number, number]> = [];
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (const id of vertexIds) {
    const p: Vec3 = [position[id * 3], position[id * 3 + 1], position[id * 3 + 2]];
    projected.push([dot(p, u), dot(p, v)]);
    const t = dot(p, axis);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }

  const circle = fitCircle(projected);
  if (!circle || circle.radius <= 1e-6) return null;
  if (circle.maxResidual > Math.max(0.02, circle.radius * 0.03)) return null;

  const anglesDeg = projected.map(
    ([x, y]) => (Math.atan2(y - circle.cy, x - circle.cx) * 180) / Math.PI + 180
  );

  return {
    axis,
    axisPoint: add(scale(u, circle.cx), scale(v, circle.cy)),
    radius: circle.radius,
    spanDeg: angularSpanDeg(anglesDeg),
    tMin,
    tMax,
  };
}

/* -------------------- 内側／外側の対応付け -------------------- */

/** 同一軸とみなす方向差（度）と軸線距離（mm） */
const AXIS_PARALLEL_DEG = 1.5;
const AXIS_DISTANCE_TOL = 0.05;

/** 内外ペアの半径差が板厚と一致するとみなす許容差（mm） */
const PAIR_THICKNESS_TOL = 0.3;
/** 外形コーナーRとみなす軸方向長さ（板厚に対する倍率） */
const CORNER_FILLET_LENGTH_FACTOR = 1.5;
/** 面取りRとみなす半径（板厚に対する倍率） */
const EDGE_FILLET_RADIUS_FACTOR = 0.2;

function isSameAxis(a: CylinderFace, b: CylinderFace): boolean {
  const parallelLimit = Math.cos((AXIS_PARALLEL_DEG * Math.PI) / 180);
  if (Math.abs(dot(a.axis, b.axis)) < parallelLimit) return false;
  return length(sub(a.axisPoint, b.axisPoint)) <= AXIS_DISTANCE_TOL;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export interface AnalyzeOptions {
  /** 加工条件に登録された板厚（mm）。分類の基準として最優先で使う。 */
  thicknessHint?: number | null;
}

/** 円筒面（と対になる面）の組 */
interface CylinderPair {
  inner: CylinderFace;
  outer: CylinderFace | null;
}

/**
 * 同軸・回転角が近い円筒を対にする。
 * 半径差が板厚と一致することは後段で検証するため、ここでは形状の近さのみで結ぶ。
 */
function pairCylinders(candidates: readonly CylinderFace[]): CylinderPair[] {
  const used = new Set<number>();
  const pairs: CylinderPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    const inner = candidates[i];
    let partner: number | null = null;
    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      const other = candidates[j];
      if (!isSameAxis(inner, other)) continue;
      if (Math.abs(other.spanDeg - inner.spanDeg) > 15) continue;
      partner = j;
      break;
    }
    used.add(i);
    if (partner != null) used.add(partner);
    pairs.push({ inner, outer: partner != null ? candidates[partner] : null });
  }
  return pairs;
}

/**
 * 半径差が板厚と合わない対を解体する。
 * 座面の段差のように同軸で無関係な円筒が対になると板厚・確度を誤るため。
 */
function validatePairs(pairs: readonly CylinderPair[], thickness: number): CylinderPair[] {
  const validated: CylinderPair[] = [];
  for (const pair of pairs) {
    if (!pair.outer) {
      validated.push(pair);
      continue;
    }
    const gap = pair.outer.radius - pair.inner.radius;
    if (Math.abs(gap - thickness) <= PAIR_THICKNESS_TOL) {
      validated.push(pair);
    } else {
      validated.push({ inner: pair.inner, outer: null });
      validated.push({ inner: pair.outer, outer: null });
    }
  }
  return validated;
}

type CylinderKind = "bend" | "cornerFillet" | "edgeFillet";

/**
 * 円筒面の種別を決める。
 * 軸方向の長さが板厚と同程度なら板厚方向に立った円筒＝外形コーナーRであり、
 * 曲げ線にはなり得ない。これがもっとも確実な除外条件。
 */
function classifyCylinder(pair: CylinderPair, thickness: number): CylinderKind {
  const axialLength = pair.inner.tMax - pair.inner.tMin;
  if (axialLength <= thickness * CORNER_FILLET_LENGTH_FACTOR) return "cornerFillet";
  if (!pair.outer && pair.inner.radius < thickness * EDGE_FILLET_RADIUS_FACTOR) {
    return "edgeFillet";
  }
  return "bend";
}

function toDetectedBend(pair: CylinderPair, confidence: BendConfidence): DetectedBend {
  const { inner, outer } = pair;
  return {
    index: 0,
    innerRadius: round(inner.radius),
    outerRadius: outer ? round(outer.radius) : null,
    angleDeg: round(inner.spanDeg, 1),
    lengthMm: round(inner.tMax - inner.tMin, 1),
    axisDir: inner.axis,
    axisStart: add(inner.axisPoint, scale(inner.axis, inner.tMin)),
    axisEnd: add(inner.axisPoint, scale(inner.axis, inner.tMax)),
    confidence,
  };
}

export function analyzeMeshes(
  meshes: readonly OcctMesh[],
  options: AnalyzeOptions = {}
): ModelAnalysis {
  const cylinders: CylinderFace[] = [];
  let faceCount = 0;
  let brepFacesAvailable = false;
  const boxMin: Vec3 = [Infinity, Infinity, Infinity];
  const boxMax: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const mesh of meshes) {
    const position = mesh.attributes.position.array;
    const index = mesh.index.array;

    for (let i = 0; i + 2 < position.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        boxMin[axis] = Math.min(boxMin[axis], position[i + axis]);
        boxMax[axis] = Math.max(boxMax[axis], position[i + axis]);
      }
    }
    const triangleTotal = Math.floor(index.length / 3);
    const faces = mesh.brep_faces ?? [];
    if (faces.length > 0) brepFacesAvailable = true;
    const ranges =
      faces.length > 0
        ? faces.map((f) => [f.first, Math.min(f.last, triangleTotal - 1)] as const)
        : ([[0, triangleTotal - 1]] as const as ReadonlyArray<readonly [number, number]>);

    for (const [first, last] of ranges) {
      if (last < first) continue;
      faceCount++;
      const cylinder = fitCylinderFace(position, index, first, last);
      if (cylinder) cylinders.push(cylinder);
    }
  }

  const holes = cylinders.filter((c) => c.spanDeg >= FULL_CIRCLE_DEG);
  const candidates = cylinders
    .filter((c) => c.spanDeg < FULL_CIRCLE_DEG)
    .sort((a, b) => a.radius - b.radius);

  const loosePairs = pairCylinders(candidates);

  // 形状から推定した板厚。加工条件との照合に使うため、基準板厚とは別に保持する。
  const estimated = median(
    loosePairs
      .filter((p) => p.outer != null)
      .map((p) => (p.outer as CylinderFace).radius - p.inner.radius)
  );

  const hint = options.thicknessHint;
  const basisThickness = hint != null && hint > 0 ? hint : estimated;
  const thicknessSource: ThicknessSource =
    hint != null && hint > 0 ? "condition" : estimated != null ? "estimated" : "unknown";

  const excluded: CylinderBreakdown = {
    holes: holes.length,
    cornerFillets: 0,
    edgeFillets: 0,
  };

  // 基準板厚が無い場合は分類できないため、除外せず全件を要確認として返す
  const detected: DetectedBend[] = [];
  if (basisThickness == null) {
    for (const pair of loosePairs) detected.push(toDetectedBend(pair, "review"));
  } else {
    for (const pair of validatePairs(loosePairs, basisThickness)) {
      const kind = classifyCylinder(pair, basisThickness);
      if (kind === "cornerFillet") {
        excluded.cornerFillets++;
        continue;
      }
      if (kind === "edgeFillet") {
        excluded.edgeFillets++;
        continue;
      }
      detected.push(toDetectedBend(pair, pair.outer ? "high" : "review"));
    }
  }

  const bends = detected
    .sort((a, b) => {
      const am = add(a.axisStart, a.axisEnd);
      const bm = add(b.axisStart, b.axisEnd);
      return am[0] - bm[0] || am[1] - bm[1] || am[2] - bm[2];
    })
    .map((bend, i) => ({ ...bend, index: i + 1 }));

  return {
    bends,
    thickness: estimated != null ? round(estimated) : null,
    basisThickness: basisThickness != null ? round(basisThickness) : null,
    thicknessSource,
    faceCount,
    cylinderCount: cylinders.length,
    holeCount: holes.length,
    excluded,
    brepFacesAvailable,
    boundingBox: Number.isFinite(boxMin[0]) ? { min: boxMin, max: boxMax } : null,
  };
}
