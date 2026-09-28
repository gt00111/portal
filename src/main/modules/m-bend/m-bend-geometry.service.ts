import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getMBendDbPath } from "@main/db/mBendConnection.js";
import { defaultPlacement, placementMatrix, validateGeometryTarget, validatePlacement,
  type GeometryTarget, type GeometryUpdate, type ToolGeometry } from "@shared/mBendGeometry.js";
import * as repo from "./m-bend-geometry.repo.js";

const MAX_BYTES = 50 * 1024 * 1024;
function root(): string {
  const dbPath = getMBendDbPath();
  if (!dbPath) throw new Error("M-BEND DBが未接続です。");
  return path.join(path.dirname(dbPath), "m-bend-assets");
}
function check(target: GeometryTarget): void {
  validateGeometryTarget(target);
  if (!repo.exists(target)) throw new Error("対象の金型がありません。");
}
function revision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("更新番号が不正です。");
}
function modelPath(relative: string): string {
  if (!/^models\/[a-f0-9]{64}\.step$/.test(relative)) throw new Error("モデル保存先が不正です。");
  return path.join(root(), relative);
}
export function getGeometry(target: GeometryTarget): ToolGeometry { check(target); return repo.get(target); }
export function savePlacement(input: GeometryUpdate): ToolGeometry {
  check(input); revision(input.revision); validatePlacement(input.placement);
  return repo.save(input, { ...repo.get(input), placement: input.placement }, input.revision);
}
export async function importStep(target: GeometryTarget, expectedRevision: number, source: string): Promise<ToolGeometry> {
  check(target); revision(expectedRevision);
  const dbPath = getMBendDbPath();
  const assetRoot = root();
  if (!/\.(step|stp)$/i.test(source)) throw new Error("STEP / STPファイルを選択してください。");
  const info = await stat(source);
  if (!info.isFile() || info.size > MAX_BYTES || info.size === 0) throw new Error("STEPは50MB以下の空でないファイルを選択してください。");
  const bytes = await readFile(source);
  if (bytes.length > MAX_BYTES || !bytes.subarray(0, 4096).toString("ascii").includes("ISO-10303-21;")) {
    throw new Error("STEP形式のファイルではありません（ISO-10303-21）。");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const relativePath = `models/${sha256}.step`;
  await mkdir(path.join(assetRoot, "models"), { recursive: true });
  try { await writeFile(path.join(assetRoot, relativePath), bytes, { flag: "wx" }); }
  catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }
  if (getMBendDbPath() !== dbPath) throw new Error("接続DBが変更されました。再度取り込んでください。");
  const current = repo.get(target);
  return repo.save(target, { fileName: path.basename(source), relativePath, sha256, revision: expectedRevision,
    placement: current.sha256 === sha256 ? current.placement : defaultPlacement() }, expectedRevision);
}
export async function readModel(target: GeometryTarget): Promise<{ base64: string }> {
  const value = getGeometry(target);
  if (!value.relativePath) throw new Error("STEPが未登録です。");
  const file = modelPath(value.relativePath);
  if ((await stat(file)).size > MAX_BYTES) throw new Error("STEPは50MB以下にしてください。");
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw new Error("STEPファイルが変更されています。再登録してください。");
  return { base64: bytes.toString("base64") };
}
export function exportGeometry(target: GeometryTarget): Record<string, unknown> | null {
  const value = getGeometry(target);
  if (!value.relativePath) return null;
  const file = modelPath(value.relativePath);
  if (!existsSync(file)) throw new Error(`金型STEPが見つかりません: ${value.fileName}`);
  return { ...value, stepPath: file, unit: "mm", frame: "X-length_Y-backgauge_Z-up",
    transformOrder: "offset + Rz * Ry * Rx * (source - anchor)", matrixLayout: "column-major",
    sourceToToolMatrix: placementMatrix(value.placement) };
}
