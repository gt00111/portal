import { getMBendDb } from "@main/db/mBendConnection.js";
import { defaultPlacement, type GeometryTarget, type ToolGeometry } from "@shared/mBendGeometry.js";

const columns = { m_upper_tools: "upper_tool_id", m_lower_tools: "lower_tool_id", m_tool_holders: "holder_id" } as const;
export function exists(target: GeometryTarget): boolean {
  return Boolean(getMBendDb().prepare(`SELECT id FROM ${target.table} WHERE id=?`).get(target.id));
}
export function get(target: GeometryTarget): ToolGeometry {
  const row = getMBendDb().prepare(`SELECT * FROM tool_geometry WHERE ${columns[target.table]}=?`).get(target.id) as
    { file_name: string | null; relative_path: string | null; sha256: string | null; placement_json: string; revision: number } | undefined;
  return row ? { fileName: row.file_name, relativePath: row.relative_path, sha256: row.sha256, placement: JSON.parse(row.placement_json), revision: row.revision }
    : { fileName: null, relativePath: null, sha256: null, placement: defaultPlacement(), revision: 0 };
}
export function save(target: GeometryTarget, value: ToolGeometry, expectedRevision: number): ToolGeometry {
  const db = getMBendDb();
  return db.transaction(() => {
    if (!exists(target)) throw new Error("対象の金型がありません。");
    if (get(target).revision !== expectedRevision) throw new Error("他の操作で更新されています。再読込してから保存してください。");
    const column = columns[target.table];
    db.prepare(`INSERT INTO tool_geometry (${column}, file_name, relative_path, sha256, placement_json, revision)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(${column}) DO UPDATE SET
      file_name=excluded.file_name, relative_path=excluded.relative_path, sha256=excluded.sha256,
      placement_json=excluded.placement_json, revision=excluded.revision, updated_at=datetime('now')`)
      .run(target.id, value.fileName, value.relativePath, value.sha256, JSON.stringify(value.placement), expectedRevision + 1);
    return get(target);
  })();
}
