/** 図面ライブラリのヘルプ・ページ冒頭用文言 */

export const DRAWING_LIBRARY_PAGE_TAGLINE =
  "顧客図面は生産ボードの提供ファイルと連携し、自社発行図面は図面ライブラリ専用 DB で管理します。PDF 比較は登録図面に依存しない補助機能です。";

export const CUSTOMER_DRAWINGS_PAGE_TAGLINE =
  "生産ボードに登録された顧客提供ファイルを、案件単位で検索・ダウンロードできます。データの正は生産ボード側です。";

export const WORK_DRAWINGS_PAGE_TAGLINE =
  "自社発行図面を登録・検索・更新します。客先・機種・図面番号・Rev などで管理し、旧版化（obsolete）にも対応します。";

export const PDF_COMPARE_PAGE_TAGLINE =
  "ローカルの PDF を2つ選び、差分比較ツールで並べて確認します。図面 DB に登録していないファイルでも利用できます。";

export const HELP_DB_STORAGE_NOTE =
  "自社発行図面はポータルと同じデータフォルダの drawing-library.db に保存されます。";

export const CUSTOMER_DRAWINGS_TAB_HELP =
  "カードを開くと、その案件に紐づく提供ファイルを一覧し、個別または一括でダウンロードできます。検索・客先・リビジョンで絞り込めます。";

export const WORK_DRAWINGS_TAB_HELP =
  "新規登録・編集・旧版化ができます（編集者以上）。一覧から詳細を開き、関連 PDF のプレビューやダウンロードが可能です。カテゴリはマスタの「カテゴリ」タブと連携します。";

export const PDF_COMPARE_TAB_HELP =
  "比較元・比較先の PDF を選び、社内ツールで差分表示します。初回のみ compare_drawings.exe または Python スクリプトの配置が必要な場合があります（詳細は resources/tools の README）。";

/** @deprecated 後方互換。新規はタブラベル用定数を使用 */
export const DRAWING_LIBRARY_OVERVIEW = DRAWING_LIBRARY_PAGE_TAGLINE;

export const PDF_COMPARE_TAB_HELP_PRIMARY = PDF_COMPARE_PAGE_TAGLINE;

export const PDF_COMPARE_TAB_HELP_NOTE =
  "環境変数 DRAWING_COMPARE_EXE または POPPLER_PATH でツールの場所を指定できる場合があります。";
