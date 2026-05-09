/** CSV インポート 1 行目の列名（インポート処理・テンプレ生成で共用） */
export const CSV_IMPORT_HEADERS = [
  "客先",
  "機種",
  "図面番号(品番)",
  "名称",
  "号機",
  "リビジョン",
  "納期",
  "内容",
  "グループ",
  "入力者",
] as const;

export type CsvImportHeader = (typeof CSV_IMPORT_HEADERS)[number];

/** ヘッダー行に無くてもよい列（旧テンプレート互換） */
export function isOptionalCsvImportColumn(h: CsvImportHeader): boolean {
  return h === "リビジョン";
}

/** 図面番号列のヘッダー別名（レガシー「品番」） */
export const CSV_IMPORT_PART_NUMBER_ALIASES = ["図面番号(品番)", "品番"] as const;

/** UI / ドキュメント用の列説明 */
export const CSV_IMPORT_COLUMN_DESCRIPTIONS: Record<CsvImportHeader, string> = {
  客先: "マスターDBに登録されている客先名（完全一致）。未登録の名称はエラーになります。",
  機種: "マスターDBに登録されている機種名（完全一致）。",
  "図面番号(品番)":
    "マスターDBに登録されている品番・図面番号。1行目の列名は従来どおり「品番」でも読み込めます。",
  名称: "マスターDBの部品名称マスターに登録されている名称（完全一致）。",
  号機: "号機番号など。半角・全角の文字列をそのまま保存します。",
  リビジョン:
    "図面・設変のリビジョン（例: A, 01）。空欄可。列ごと省略した CSV（旧形式）もインポートできます。",
  納期: "YYYY-MM-DD 形式を推奨（例: 2026-06-30）。スラッシュやドット区切りも解釈されます。",
  内容: "依頼内容の自由記述。",
  グループ: "マスターDBに登録されているグループ名（完全一致）。",
  入力者: "マスターDBのユーザー（入力者）名（完全一致）。",
};

/** UTF-8（BOM 付き）のテンプレート CSV 文字列（ヘッダー行のみ） */
export function buildCsvImportTemplateContent(): string {
  const bom = "\uFEFF";
  const line = CSV_IMPORT_HEADERS.join(",") + "\r\n";
  return bom + line;
}
