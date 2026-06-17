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
      "取締役・部長・工場長が毎日確認し、客先や機種、品番など、ポータル全体で使う基本情報をまとめて管理するアプリです。どのアプリから入力しても同じ名称・同じ選び方になるように整えておくのが役目で、誰が操作しても入力のブレが起きにくくなります。現場の方が直接触ることは少ないかもしれませんが、生産ボードや部材管理、図面ライブラリで選ぶ名前の元になっている、いわば「共通の名簿」です。ここを日々整えておくと、後工程の入力が迷子になりません。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "seisan-board",
    displayName: "生産ボード",
    section: "office-support" as const,
    description:
      "各部署の長が毎日開き、顧客から受注が入ったら品番単位で進捗を追うアプリです。いつまでに納品しなければならないか、今どの段階にいるかを一覧で把握でき、納期の時間管理ができます。受注の登録は長が行い、新人の方にはまずガントチャートの期間を見て、次の工程に間に合うように動くところから始めてもらうのがおすすめです。顧客から預かった図面や資料も品番ごとに整理され、図面ライブラリの「顧客図面」から同じ内容を探せます。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "parts-tracker",
    displayName: "部材管理",
    section: "office-support" as const,
    description:
      "事務や生産管理が使い、生産ボードの品番とは別に、製品を構成する部品の Rev や、購入品・支給品の手配状況を細かく追います。いつまでに部品が揃わないと困るか、手配の期限はいつまでかを一覧で見られ、欠品や発注漏れを防ぐのがゴールです。生産ボードが品番全体の流れを見るのに対し、部材管理は「中身の部品表」と「いつ手配するか」に寄ったアプリだと思ってください。危ないものが早めに目に入るよう、期限まわりは見やすく表示されます。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "drawing-library",
    displayName: "図面ライブラリ",
    section: "office-support" as const,
    description:
      "「顧客図面」は生産ボードに登録された提供ファイルを、品番と一緒に探せます。「自社発行」は社内で作った図面を Rev ごとに登録・履歴管理でき、客先・機種・図面番号の順で絞り込むと欲しい図面にたどり着きやすくなっています。治具や社内設備の図面もカテゴリで分けて登録できます。PDF 比較は、比較したいファイルを PC 上に用意してから、それぞれ選んで並べるおまけ機能です。完璧に差分が出るわけではないので、目安確認程度に使ってください。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "process-management",
    displayName: "工程管理",
    section: "progress" as const,
    description:
      "生産技術が使い、生産ボードでは見にくい「設計」と「レーザーデータ作成」の進捗だけを、部内で細かく追えるようにしたアプリです。SolidWorks や CADMAC など、担当する作業に合わせた見え方に切り替えられ、今どこまで進んでいるかがひと目で分かります。品番全体の日程や納期は生産ボード、技術部門の中の進み具合は工程管理、という使い分けをイメージしてください。部内の進捗共有や、次に手を付ける作業の整理に向いています。",
    kind: "internal" as const,
    ready: true,
  },
  {
    id: "pixo-converter",
    displayName: "PixoConverter",
    section: "helper-apps" as const,
    description:
      "事務所のみんなが、日々の資料づくりに使う変換・編集ツールです。社内図面を PDF で揃えたいとき、購入品の図面を作るとき、図面ライブラリの自社発行に載せるファイルを用意するときなど、ポータルからすぐ開けます。PDF や画像の変換、複数ファイルの結合、ページの入れ替えなど、印刷や登録の直前に体裁を整える場面で助かります。面倒なファイル作業を、このアプリに任せてしまうイメージです。",
    kind: "internal" as const,
    ready: true,
  },
] as const;
