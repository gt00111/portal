import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectFile, ProjectFileWithProject } from "@shared/seisan/projectFile.js";

import { resolveStoredPath, toRelativeDataPath } from "@main/db/dataRoot.js";
import { getSeisanDb, getSeisanDbPath } from "@main/db/seisanConnection.js";
import { generateId } from "@main/seisan/utils/id.js";
import { now } from "@main/seisan/utils/datetime.js";

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.dxf',
  '.tif',
  '.tiff',
  '.png',
  '.jpg',
  '.jpeg',
  '.docx',
  '.xlsx',
  '.xdw',
  '.xbd',
])

function normalizeExt(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

function ensureAllowedFile(filePath: string): string {
  const ext = normalizeExt(filePath)
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('対応していないファイル形式です')
  }
  return ext
}

/** DB 保存パス（相対 or 絶対）を実ファイルパスへ解決 */
export function resolveProjectFilePath(storedPath: string): string {
  return resolveStoredPath(storedPath);
}

function sanitizePathSegment(input: string): string {
  const raw = input.trim()
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '')
  return safe || 'unknown'
}

async function ensureUniqueFilePath(baseDir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  let candidate = path.join(baseDir, fileName)
  let seq = 1
  while (true) {
    try {
      await fs.access(candidate)
      seq += 1
      candidate = path.join(baseDir, `${stem}_${seq}${ext}`)
    } catch {
      return candidate
    }
  }
}

export function getProjectMeta(projectId: string): {
  project_no: string | null
  company_name: string | null
  group_name: string | null
} | null {
  const db = getSeisanDb()
  const row = db
    .prepare(
      `
      SELECT
        p.project_no,
        p.company_id AS company_name,
        p.group_id AS group_name
      FROM projects p
      WHERE p.id = ?
      `
    )
    .get(projectId) as
    | {
        project_no: string | null
        company_name: string | null
        group_name: string | null
      }
    | undefined

  return row ?? null
}

export function getById(id: string): ProjectFile | null {
  const db = getSeisanDb()
  const row = db.prepare('SELECT * FROM project_files WHERE id = ?').get(id) as ProjectFile | undefined
  return row ?? null
}

export function listByProject(projectId: string): ProjectFile[] {
  const db = getSeisanDb()
  return db
    .prepare(
      `
      SELECT *
      FROM project_files
      WHERE project_id = ?
      ORDER BY created_at DESC
      `
    )
    .all(projectId) as ProjectFile[]
}

/** 全案件の提供ファイルを案件情報付きで一覧（図面ライブラリと同期） */
export function listAllWithProject(): ProjectFileWithProject[] {
  const db = getSeisanDb()
  return db
    .prepare(
      `
      SELECT
        pf.id,
        pf.project_id,
        pf.file_name,
        pf.file_path,
        pf.file_ext,
        pf.is_obsolete,
        pf.created_at,
        pf.updated_at,
        p.project_no,
        p.company_id,
        p.model_type,
        p.part_number,
        p.revision,
        p.project_name,
        p.group_id
      FROM project_files pf
      INNER JOIN projects p ON p.id = pf.project_id
      ORDER BY pf.updated_at DESC
      `
    )
    .all() as ProjectFileWithProject[]
}

export async function add(projectId: string, filePath: string): Promise<ProjectFile> {
  const db = getSeisanDb()
  const ext = ensureAllowedFile(filePath)
  const id = generateId()
  const ts = now()
  const srcFileName = path.basename(filePath)

  const projectMeta = getProjectMeta(projectId)

  if (!projectMeta) {
    throw new Error('案件が見つかりません')
  }

  const dbPath = getSeisanDbPath()
  if (!dbPath) {
    throw new Error('DBパスが取得できません')
  }

  const rootDir = path.dirname(dbPath)
  const targetDir = path.join(
    rootDir,
    sanitizePathSegment(projectMeta.group_name ?? '未分類'),
    sanitizePathSegment(projectMeta.company_name ?? '未登録'),
    sanitizePathSegment(projectMeta.project_no ?? projectId)
  )
  await fs.mkdir(targetDir, { recursive: true })

  const finalFilePath = await ensureUniqueFilePath(targetDir, srcFileName)
  const finalFileName = path.basename(finalFilePath)
  try {
    await fs.access(filePath)
  } catch {
    throw new Error('コピー元のファイルが見つかりません')
  }
  await fs.copyFile(filePath, finalFilePath)

  const storedPath = toRelativeDataPath(finalFilePath)

  db.prepare(
    `
    INSERT INTO project_files (
      id, project_id, file_name, file_path, file_ext, is_obsolete, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(id, projectId, finalFileName, storedPath, ext, 0, ts, ts)

  return db.prepare('SELECT * FROM project_files WHERE id = ?').get(id) as ProjectFile
}

export function setObsolete(id: string, isObsolete: boolean): void {
  const db = getSeisanDb();
  db.prepare("UPDATE project_files SET is_obsolete = ?, updated_at = ? WHERE id = ?").run(
    isObsolete ? 1 : 0,
    now(),
    id
  );
}

export async function remove(id: string): Promise<void> {
  const db = getSeisanDb();
  const file = getById(id);
  if (file?.file_path) {
    try {
      await fs.unlink(resolveProjectFilePath(file.file_path));
    } catch (err) {
      console.warn(`ファイル削除失敗 (${file.file_path}):`, err);
    }
  }
  db.prepare("DELETE FROM project_files WHERE id = ?").run(id);
}
