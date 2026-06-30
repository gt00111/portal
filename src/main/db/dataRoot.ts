import path from "node:path";

import { getDbPath } from "./connection.js";

/** 接続中 portal-master.db の親ディレクトリ（共有データフォルダの根） */
export function getDataRoot(): string {
  const dbPath = getDbPath();
  if (!dbPath) {
    throw new Error("中央データベースが開かれていません。");
  }
  return path.dirname(dbPath);
}

/** データ根からの相対パスを絶対パスに解決（パストラバーサル防止） */
export function resolveUnderDataRoot(relativePath: string): string {
  const root = path.resolve(getDataRoot());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("ファイルパスが許可範囲外です。");
  }
  return abs;
}

/** DB に保存されたパス（相対 or 絶対）を絶対パスへ解決 */
export function resolveStoredPath(storedPath: string): string {
  const trimmed = storedPath.trim();
  if (!trimmed) {
    throw new Error("ファイルパスが空です。");
  }
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return resolveUnderDataRoot(trimmed);
}

/** データ根配下の絶対パスを DB 保存用の相対パス（/ 区切り）に変換 */
export function toRelativeDataPath(absolutePath: string): string {
  const root = path.resolve(getDataRoot());
  const abs = path.resolve(absolutePath);
  const relative = path.relative(root, abs).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("指定ファイルはデータフォルダ外です。");
  }
  return relative;
}
