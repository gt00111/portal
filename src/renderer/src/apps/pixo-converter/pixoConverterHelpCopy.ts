/** PixoConverter のヘルプ・ページ別操作手順 */

export type PixoHelpVariant = "pdf-convert" | "tiff-convert" | "image-convert" | "merge" | "replace";

export const PIXO_COMMON_USE =
  "社内図面の PDF 化、購入品図面の作成、図面ライブラリ自社発行の登録用ファイル作成などに使います。";

export const HELP_PIXO_SECTIONS: Record<
  PixoHelpVariant,
  { title: string; body?: string; steps: readonly string[] }
> = {
  "pdf-convert": {
    title: "PDF → JPG/PNG 変換",
    body: "PDF を JPEG または PNG に変換します。複数ページは1ページずつに分解されます。",
    steps: [
      "ドロップエリアに PDF をドラッグ＆ドロップ（またはクリックで選択）",
      "出力形式（JPG / PNG）を選択",
      "「変換」をクリックして変換実行",
      "プレビューで結果を確認",
      "「保存」で保存先フォルダを指定して書き出し",
      "やり直す場合は「キャンセル」で一時ファイルと画面をリセット",
    ],
  },
  "tiff-convert": {
    title: "TIFF/TIF → PDF 変換",
    body: "TIFF 画像を PDF に変換します。複数ファイルをまとめて処理できます。",
    steps: [
      "ドロップエリアに TIFF/TIF ファイルを追加",
      "「変換」をクリック",
      "変換後の PDF をプレビューで確認",
      "「保存」で出力先を指定",
      "「キャンセル」でリセット",
    ],
  },
  "image-convert": {
    title: "PNG/JPG → PDF 変換",
    body: "画像ファイルを PDF にまとめます。",
    steps: [
      "ドロップエリアに PNG / JPG ファイルを追加",
      "「変換」をクリック",
      "生成された PDF をプレビューで確認",
      "「保存」で出力先を指定",
      "「キャンセル」でリセット",
    ],
  },
  merge: {
    title: "PDF ファイル連結",
    body: "複数の PDF を1つのファイルに結合します。",
    steps: [
      "ドロップエリアに結合したい PDF を複数追加",
      "サムネイル一覧でドラッグして並び順を調整",
      "「結合」をクリックして処理",
      "プレビューで結合結果を確認",
      "「保存」で1つの PDF として書き出し",
      "「キャンセル」でリセット",
    ],
  },
  replace: {
    title: "PDF ページ編集",
    body: "既存 PDF の指定ページを差し替え・削除できます。",
    steps: [
      "「対象 PDF を選択」で編集する PDF を開く",
      "操作種別で「差し替え」または「削除」を選択",
      "サムネイルで対象ページをクリック（削除は複数選択可）",
      "差し替えの場合は「差し替え元 PDF」を選択",
      "「実行」でページ編集を適用",
      "プレビューで結果を確認し「保存」で書き出し",
      "版履歴から以前の状態に戻すことも可能",
    ],
  },
};

export const PIXO_HELP_TITLES: Record<PixoHelpVariant, string> = {
  "pdf-convert": "PDF → JPG/PNG 変換のヘルプ",
  "tiff-convert": "TIFF → PDF 変換のヘルプ",
  "image-convert": "画像 → PDF 変換のヘルプ",
  merge: "PDF 連結のヘルプ",
  replace: "PDF ページ編集のヘルプ",
};
