/** 図面ライブラリのヘルプ・ページ冒頭用文言 */

export const CUSTOMER_DRAWINGS_PAGE_TAGLINE =
  "生産ボードに登録された顧客提供ファイルを、案件単位で検索・ダウンロードできます。データの正は生産ボード側です。";

export const WORK_DRAWINGS_PAGE_TAGLINE =
  "自社発行図面を Rev ごとに登録・検索します。Rev アップは既存を編集せず新規登録します。";

export const PDF_COMPARE_PAGE_TAGLINE =
  "ローカルの PDF を2つ選び、差分を並べて確認します。図面 DB に登録していないファイルでも利用できます。";

export const HELP_CUSTOMER_SECTIONS = [
  {
    title: "このページでできること",
    body: "顧客から預かった図面・資料の閲覧とダウンロード。登録・更新は生産ボードの案件詳細（提供ファイル）で行います。",
  },
  {
    title: "操作手順 — 絞り込み",
    steps: [
      "検索欄にファイル名・案件・客先・品番などを入力",
      "客先 → 機種 → 図面番号(品番) のプルダウンでカスケード絞り込み",
      "「更新」で最新の提供ファイル一覧を再読込",
    ],
  },
  {
    title: "操作手順 — ダウンロード",
    steps: [
      "案件カードを開く → 提供ファイル一覧を表示",
      "各行の「ダウンロード」で個別保存",
      "「一括ダウンロード」で案件のファイルをまとめて保存",
    ],
  },
] as const;

export const HELP_WORK_SECTIONS = [
  {
    title: "このページでできること",
    body: "自社発行図面の Rev 登録・検索・履歴確認。治具・社内設備はカテゴリで区別します。",
  },
  {
    title: "操作手順 — 絞り込み",
    steps: [
      "検索欄に客先・機種・図面番号・名称・Rev などを入力",
      "客先 → 機種 → 図面番号 のプルダウンでカスケード絞り込み",
      "「現行版のみ表示」で最新 Rev だけ一覧",
    ],
  },
  {
    title: "操作手順 — 新規登録（Rev）",
    steps: [
      "「新規」をクリック（編集者以上）",
      "SKU を選ぶと客先・機種・品番が自動入力される",
      "Rev・名称・カテゴリ・PDF を入力して保存",
      "Rev アップは既存行を編集せず、新しい Rev で「新規」登録",
    ],
  },
  {
    title: "操作手順 — 詳細・履歴",
    steps: [
      "カードまたは詳細画面を開く",
      "Rev 履歴タブで同一品番の別 Rev に切り替え",
      "eDrawings ファイルの参照・コメントの閲覧・投稿",
      "一覧カードまたは詳細の鉛筆アイコンで編集（編集者以上）",
    ],
  },
] as const;

export const HELP_PDF_COMPARE_SECTIONS = [
  {
    title: "このページでできること",
    body: "PC 上の PDF 2 つを選んで差分を目視確認します。顧客図面は先にダウンロードしてから比較してください。",
  },
  {
    title: "操作手順",
    steps: [
      "比較元（A）・比較先（B）それぞれ「PDF を選択」でファイルを指定",
      "ページ数が表示されたら「比較実行」",
      "差分ツールで並べて確認（目安確認程度・完璧な差分表示ではありません）",
      "必要に応じて比較結果画像をダウンロード",
    ],
  },
] as const;

/** @deprecated 後方互換 */
export const DRAWING_LIBRARY_PAGE_TAGLINE = CUSTOMER_DRAWINGS_PAGE_TAGLINE;
export const CUSTOMER_DRAWINGS_TAB_HELP = HELP_CUSTOMER_SECTIONS[2].steps?.join(" ");
export const WORK_DRAWINGS_TAB_HELP = HELP_WORK_SECTIONS[2].steps?.join(" ");
export const PDF_COMPARE_TAB_HELP = HELP_PDF_COMPARE_SECTIONS[1].steps?.join(" ");
export const PDF_COMPARE_TAB_HELP_PRIMARY = PDF_COMPARE_PAGE_TAGLINE;
export const PDF_COMPARE_TAB_HELP_NOTE = "登録図面に依存しない補助機能です。";
