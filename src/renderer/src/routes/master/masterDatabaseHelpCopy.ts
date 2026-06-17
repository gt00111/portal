/** マスターデータベースのヘルプ・ページ冒頭用文言 */

export const MASTER_DATABASE_PAGE_TAGLINE =
  "ポータル全体で同じ名称・同じ選び方になるよう、客先・機種・品番などの基本情報を整えます。";

export const HELP_COMMON_INTRO = {
  title: "共通の考え方",
  items: [
    "主な利用者: 取締役・部長・工場長",
    "名称を変えると各アプリの選択肢・表示に影響します",
    "無効化すると新規入力の選択肢から外れます（既存データは残ります）",
    "編集・削除はポータル admin のみ（一般ユーザーは参照のみ）",
  ],
} as const;

export const HELP_COMMON_CRUD_STEPS = [
  "検索欄にコード・名称・備考のキーワードを入力して一覧を絞り込む",
  "「新規」→ コード・名称・備考を入力 →「保存」（admin のみ）",
  "行の鉛筆アイコンで既存レコードを編集",
  "「有効」のチェックを外すと無効化（新規選択肢から除外）",
  "行の削除アイコンで削除（admin のみ・確認ダイアログあり）",
] as const;

type TabHelp = {
  title: string;
  tagline: string;
  registers: string;
  usedBy: string;
  steps?: readonly string[];
  extra?: readonly { title: string; body?: string; steps?: readonly string[] }[];
};

export const HELP_TAB_CONTENT: Record<string, TabHelp> = {
  m_customers: {
    title: "客先",
    tagline: "顧客・取引先の名称を登録します。",
    registers: "客先コード・客先名",
    usedBy: "生産ボード・図面ライブラリ・部材管理の「客先」選択肢",
  },
  m_models: {
    title: "機種",
    tagline: "製品の機種名を登録します。",
    registers: "機種コード・機種名",
    usedBy: "生産ボード・図面・部材の「機種」選択肢",
  },
  m_part_numbers: {
    title: "図面番号(品番)",
    tagline: "品番マスタを登録します。",
    registers: "品番コード・品番（図面番号）",
    usedBy: "案件・図面・SKU の品番選択肢",
  },
  m_component_names: {
    title: "部品名称",
    tagline: "部品の名称マスタを登録します。",
    registers: "部品コード・部品名称",
    usedBy: "SKU・部材管理の名称選択肢",
  },
  m_group_names: {
    title: "グループ名",
    tagline: "製造グループ（例: キャビンG）を登録します。",
    registers: "グループコード・グループ名",
    usedBy: "生産ボードの担当グループ、ガントの色分け",
  },
  m_user_names: {
    title: "ユーザー",
    tagline: "ログイン・担当者として使うユーザー名を登録します。",
    registers: "ユーザーコード・表示名",
    usedBy: "工程管理の担当者名、コメント投稿者名",
  },
  m_suppliers: {
    title: "商社",
    tagline: "購入・外注先（商社）を登録します。",
    registers: "商社コード・商社名",
    usedBy: "部材管理の商社プルダウン、標準 LT の紐づけ",
  },
  m_categories: {
    title: "カテゴリ",
    tagline: "図面の分類を scope 別に登録します。",
    registers: "カテゴリコード・名称（治具・社内設備など）",
    usedBy: "図面ライブラリ（自社発行）のカテゴリ選択",
    steps: [
      "画面上部の scope で「図面ライブラリ：自社発行」または「顧客図面」を選択",
      "選択中の scope に属するカテゴリだけが一覧に表示される",
      "新規・編集時も同じ scope が付与される",
    ],
    extra: [
      {
        title: "自社発行での使い方",
        body: "治具・社内設備用のカテゴリは「図面ライブラリ：自社発行」scope で登録します。",
      },
    ],
  },
  "procurement-lead-times": {
    title: "標準 LT",
    tagline: "商社・品目ごとの標準リードタイム（日数）を登録します。",
    registers: "調達区分・商社・品番（任意）・リードタイム日数",
    usedBy: "部材管理で購入・支給品の発注期限を自動提案",
    steps: [
      "「新規」で調達区分（購入/支給）を選択",
      "商社・品番（任意）・リードタイム日数を入力して保存",
      "部材管理で LT が空の行には、この標準値が提案される",
    ],
  },
  m_skus: {
    title: "SKU（関係）",
    tagline: "客先×機種×品番×部品名称などの組み合わせ台帳を管理します。",
    registers: "客先・機種・品番・部品名称・図面番号表記・Rev など",
    usedBy: "図面ライブラリ新規登録時の SKU 自動入力、各アプリの名寄せ",
    steps: [
      "「新規」で客先・機種・品番など必要な組み合わせを選択して登録",
      "図面番号表記・Rev を台帳用に持てる",
      "図面ライブラリの新規登録で SKU を選ぶと客先・機種・品番が自動入力される",
    ],
  },
  "user-access": {
    title: "ユーザー権限",
    tagline: "各アプリごとの admin / editor / viewer を設定します。",
    registers: "操作者アカウントとアプリ別ロール",
    usedBy: "ポータル内の各アプリの操作権限",
    steps: [
      "一覧から操作者を選び、各アプリのロールを変更",
      "admin … 設定変更・削除など / editor … データ編集 / viewer … 閲覧のみ",
      "変更は即時反映（再ログインが必要な場合あり）",
    ],
  },
  "audit-log": {
    title: "監査ログ",
    tagline: "マスタ・権限の変更履歴を確認します。",
    registers: "（参照のみ・登録操作なし）",
    usedBy: "ポータル admin の変更追跡・確認",
    steps: [
      "日時・操作者・対象テーブル・変更内容を一覧で確認",
      "検索や並び替えで特定の変更を探す",
    ],
  },
};

/** マスタ CRUD タブ用の共通操作手順 */
export function masterCrudHelpSteps(tabKey: string): readonly string[] {
  const tab = HELP_TAB_CONTENT[tabKey];
  if (tab?.steps) return tab.steps;
  return HELP_COMMON_CRUD_STEPS;
}
