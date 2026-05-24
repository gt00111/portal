import type { PortalAppSectionId } from "./types.js";

export const DEFAULT_COMPANY_NAME = "（会社名未設定）";

export const DEFAULT_MOTTOS = ["安全 第一", "品質 第二", "生産 第三"] as const;

/**
 * ホーム LP 風の任意ヒーロー背景（Vite の `src/renderer/public` に置いたファイルを `/foo.jpg` のように指定）。
 * 空文字のときは画像なし（従来のグラデーションのみ）。
 */
export const HOME_LP_BACKGROUNDS = {
  hero: "",
} as const;

export const DB_FILE_NAME = "portal-master.db";

export const SETTINGS_KEYS = {
  dbPath: "portal.dbPath",
  bootstrapped: "portal.bootstrapped",
  companyName: "company.name",
  mottos: "company.mottos",
  homeHeroBackgroundPath: "company.homeHeroBackgroundPath",
} as const;

/** ホーム画面のアプリ一覧セクション見出し順 */
export const PORTAL_APP_SECTION_ORDER: PortalAppSectionId[] = [
  "shared-database",
  "office-support",
  "progress",
  "helper-apps",
];

export const PORTAL_APP_SECTION_META: Record<
  PortalAppSectionId,
  { title: string; lead: string }
> = {
  "shared-database": {
    title: "ポータル内アプリ共有データベース",
    lead: "複数の内蔵アプリから共通参照されるマスタを、単一の中央データベースで集中管理します。",
  },
  "office-support": {
    title: "事務サポート",
    lead: "案件運び・図面・資料のやり取りを支え、現場と事務が同じ情報を起点に業務できるようにします。",
  },
  progress: {
    title: "進捗確認",
    lead: "製番ベースで計画と実績を追い、担当や工程の滞留を一覧で把握します。",
  },
  "helper-apps": {
    title: "お助けアプリ",
    lead: "変換・結合・軽い編集など、日々のデータ整形をポータルからすぐに行うためのユーティリティです。",
  },
};

export const APP_CATALOG = [
  {
    id: "master-database",
    displayName: "マスターデータベース",
    section: "shared-database" as const,
    description:
      "客先・機種・図面番号（品番）・部品名称・SKU など、製造現場と事務が共通して参照するマスタ情報を、このポータルに内蔵された中央データベースで一元管理します。登録・修正は権限を持つユーザーのみが行え、参照範囲もロールに応じて制御されます。データの所在が分散しないため、後工程の生産ボード・工程管理・図面ライブラリなどから同一の定義を参照でき、転記ミスや版ずれのリスクを抑えます。ポータルへのログインセッション内でのみ利用でき、クラウドに流出する経路は設計上ありません。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "seisan-board",
    displayName: "生産ボード",
    section: "office-support" as const,
    description:
      "製番（プロジェクト）を単位として、タスク・日報・進捗・スケジュール・案件に紐づく添付ファイルをまとめて扱います。ダッシュボードや一覧から案件詳細へすぐ移動でき、ガントで日程の俯瞰も可能です。現場が入力した日報や進捗が、そのまま事務・管理側の画面にも反映されるため、電話や口頭での二度手間を減らします。顧客から預かった図面や資料は案件ごとのフォルダに整理され、図面ライブラリの「顧客図面」タブでは同一の一覧として参照できます。引き継ぎや監査のために、いつ誰がどの記録を残したかを追いやすい構成です。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "parts-tracker",
    displayName: "部材管理",
    section: "office-support" as const,
    description:
      "生産案件ごとに部品表を管理し、調達区分・商社・標準リードタイムから発注期限を自動算出します。必要着日に対して遅延や要発注のリスクを色分けで把握でき、事務・調達担当が案件単位で部材の手配状況を追跡できます。商社マスタと標準 LT は中央マスタで一元管理し、生産ボードの案件 ID と連携します。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "drawing-library",
    displayName: "図面ライブラリ",
    section: "office-support" as const,
    description:
      "顧客から提供された図面・資料は、生産ボードに登録された提供ファイルと同一の一覧として閲覧でき、どの製番に紐づくかを見失いません。自社発行の図面は専用の drawing-library.db に登録し、顧客由来のデータと明確に区別して管理できます。補助タブでは PDF をページ送りしながら閲覧でき、任意に選んだ外部ファイル同士を並べて目視比較するためのビューアも内蔵されています。設計・現場・品質が同じデータセットを前提にコミュニケーションできることが狙いです。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "process-management",
    displayName: "工程管理",
    section: "progress" as const,
    description:
      "製番を軸に、工程計画と実績・担当者・進捗率・着手・完了などをボード形式で追跡します。プロセスビュー（例: SolidWorks / CADMAC など）に応じたタスクの見え方を切り替えられ、管理者・編集者・閲覧者といったロールに沿った操作が可能です。データは中央データベースと隣接して配置される process-management.db に保存され、生産ボード側の案件情報と整合した運用を想定しています。ボード上で滞留や完了状況を一望でき、現場会議や優先順位付けのたたき台になります。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "pixo-converter",
    displayName: "PixoConverter",
    section: "helper-apps" as const,
    description:
      "PDF・TIFF・画像形式の相互変換、複数 PDF の連結、ページの差し替え・挿入・削除などの編集を、ポータルから別ウィンドウで実行できます。印刷や送付の直前に体裁を整えたり、スキャン画像を PDF にまとめたりするような日々の事務作業を補助する位置づけです。",
    kind: "internal" as const,
    ready: true,
  },
] as const;
