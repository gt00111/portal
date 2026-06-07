/** 部材管理テーブル: 長文セル表示（30 文字 + …） */

export const BOM_TABLE_TEXT_MAX_LEN = 30;

export function truncateBomTableText(
  value: string,
  maxLen = BOM_TABLE_TEXT_MAX_LEN
): { display: string; isTruncated: boolean; full: string } {
  const full = value.trim();
  if (full.length <= maxLen) {
    return { display: full, isTruncated: false, full };
  }
  return { display: `${full.slice(0, maxLen)}…`, isTruncated: true, full };
}
