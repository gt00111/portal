export const DEFAULT_COMPANY_NAME = "（会社名未設定）";

export const DEFAULT_MOTTOS = ["安全 第一", "品質 第二", "生産 第三"] as const;

export const DB_FILE_NAME = "portal-master.db";

export const SETTINGS_KEYS = {
  dbPath: "portal.dbPath",
  bootstrapped: "portal.bootstrapped",
  companyName: "company.name",
  mottos: "company.mottos",
} as const;

export const APP_CATALOG = [
  {
    id: "master-database",
    displayName: "マスターデータベース",
    description: "客先・機種・図面番号(品番)・部品名称などの中央マスタ管理。ポータル内蔵。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "seisan-board",
    displayName: "生産ボード",
    description: "タスク・日報・製番ごとの進捗。ポータル内蔵。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "drawing-library",
    displayName: "図面ライブラリ",
    description:
      "顧客図面は生産ボードの提供ファイルと同一一覧。自社発行図面は専用 DB に登録。PDF 比較は補助タブで外部ファイル同士（内蔵）。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "process-management",
    displayName: "工程管理",
    description: "製番ベースの工程計画と実績。ポータル内蔵（中央 DB 隣に process-management.db）。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "pixo-converter",
    displayName: "PixoConverter",
    description:
      "PDF／TIFF／画像の相互変換・連結・ページ編集。ポータル内蔵（Poppler / pdftoppm は resources/tools/poppler-* または resources/pixo-converter/bin）。",
    kind: "internal" as const,
    ready: true,
  },
] as const;
