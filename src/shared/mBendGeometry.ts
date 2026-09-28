export const GEOMETRY_TABLES = ["m_upper_tools", "m_lower_tools", "m_tool_holders"] as const;
export type GeometryTable = (typeof GEOMETRY_TABLES)[number];
export type Vector3 = [number, number, number];

export interface ToolPlacement {
  /** All source coordinates are millimetres; OCCT imports STEP in mm. */
  anchor: Vector3;
  mountPoint: Vector3;
  mountNormal: Vector3;
  rotationDeg: Vector3;
  offset: Vector3;
}
export interface ToolGeometry {
  fileName: string | null;
  relativePath: string | null;
  sha256: string | null;
  revision: number;
  placement: ToolPlacement;
}
export interface GeometryTarget { table: GeometryTable; id: number }
export interface GeometryUpdate extends GeometryTarget { revision: number; placement: ToolPlacement }
export const defaultPlacement = (): ToolPlacement => ({
  anchor: [0, 0, 0], mountPoint: [0, 0, 0], mountNormal: [0, 0, 1],
  rotationDeg: [0, 0, 0], offset: [0, 0, 0],
});
export function validateGeometryTarget(value: GeometryTarget): void {
  if (!value || !GEOMETRY_TABLES.includes(value.table) || !Number.isSafeInteger(value.id) || value.id < 1) {
    throw new Error("金型の指定が不正です。");
  }
}
export function validatePlacement(value: ToolPlacement): void {
  for (const key of ["anchor", "mountPoint", "mountNormal", "rotationDeg", "offset"] as const) {
    const vector = value?.[key];
    if (!Array.isArray(vector) || vector.length !== 3 || !vector.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6)) {
      throw new Error("座標・角度は有限の数値を3軸分入力してください。");
    }
  }
  if (Math.hypot(...value.mountNormal) < 1e-9) throw new Error("取付面の法線はゼロにできません。");
}

/** Right-handed frame: X=tool length, Y=back gauge, Z=up.
 * Column-major matrix: offset + Rz * Ry * Rx * (source - anchor).
 */
export function placementMatrix(value: ToolPlacement): number[] {
  validatePlacement(value);
  const [x, y, z] = value.rotationDeg.map((v) => v * Math.PI / 180);
  const [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
  const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)];
  const m = [cz*cy, sz*cy, -sy, 0,
    cz*sy*sx-sz*cx, sz*sy*sx+cz*cx, cy*sx, 0,
    cz*sy*cx+sz*sx, sz*sy*cx-cz*sx, cy*cx, 0, 0, 0, 0, 1];
  for (let i = 0; i < 3; i++) m[12+i] = value.offset[i] - m[i]*value.anchor[0] - m[4+i]*value.anchor[1] - m[8+i]*value.anchor[2];
  return m;
}
