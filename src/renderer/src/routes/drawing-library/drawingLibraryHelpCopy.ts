/** 図面ライブラリのヘルプモーダル用文言 */

export const DRAWING_LIBRARY_OVERVIEW =
  "顧客図面は生産ボードの提供ファイルと同一です。自社発行は drawing-library.db に保存します。PDF 比較は補助機能です。";

export const CUSTOMER_DRAWINGS_TAB_HELP =
  "顧客図面は生産ボードの「提供ファイル」と同一です。カードを開くと案件に登録された全ファイルをダウンロードできます。";

export const WORK_DRAWINGS_TAB_HELP =
  "自社発行図面。データはポータル DB と隣接する drawing-library.db に保存されます。";

export const PDF_COMPARE_TAB_HELP_PRIMARY =
  "補助機能です。登録図面 DB に依存せず、ローカルの PDF を2つ選んで比較します（compare_drawings.exe または Python スクリプト）。";

export const PDF_COMPARE_TAB_HELP_NOTE =
  "初回のみ: 社内配布用に compare_drawings.exe を使う場合は、resources/tools/ に配置するか、環境変数 DRAWING_COMPARE_EXE で指定してください（詳細は同フォルダの README）。Python 利用時は Poppler を POPPLER_PATH で指定できます。";
