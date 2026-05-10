/** 工程管理のヘルプモーダル・ページ冒頭用文言 */

/** ボードタブ：メイン画面の短い説明 */
export const BOARD_PAGE_TAGLINE =
  "全員が同じ一覧で工程の進みを確認できます。案件の基準は生産ボードです。";

/** マイタスクタブ：メイン画面の短い説明 */
export const MY_TASKS_PAGE_TAGLINE =
  "あなたが担当する未完了タスクだけが表示されます。進捗％とメモは一覧でまとめて保存します。";

/** ヘルプ：保存場所の説明 */
export const HELP_DB_STORAGE_NOTE =
  "工程データはポータルのデータベースと同じフォルダにある process-management.db に保存されます。";

/** ヘルプ：実パス見出し（取得済みのときのみ表示） */
export const HELP_DB_PATH_LABEL = "実行時のファイルパス";

export const BOARD_HELP_OVERVIEW =
  "全体俯瞰：案件の正は生産ボードです。こちらは全員が同じ一覧で工程状況を確認します（ログインユーザーごとに一覧を変えることはありません）。";

export const BOARD_HELP_PROGRESS =
  "担当者がマイタスクで入力した進捗（0〜100％のスライダー）と進捗メモは、下の一覧で全員が閲覧できます。メモ未記入の行は区別して表示されます。案件列の「案件内容」から、生産ボードの案件詳細を閲覧のみできます。";

/** `PROCESS_VIEW_LABELS[session.processView]` を差し込んで表示する */
export const BOARD_HELP_VIEW_ACTIVE_TEMPLATE = (
  processLabel: string
) =>
  `表示される工程の切り替えは、アカウントの工程表示設定（現在：${processLabel}）に連動します（アクティブ一覧のみ）。`;

export const BOARD_HELP_HISTORY =
  "履歴では SolidWorks / CADMAC / 両方を切り替えて、完了したタスクだけを確認できます。";

export const BOARD_HELP_ACTIVE_HISTORY_HINT =
  "アクティブ＝完了以外のタスク（一覧の工程フィルタはアカウント設定どおり）。履歴＝完了済みのみ。CADMAC はアクティブ表示時、SolidWorks 側の完了条件と同様に進められます。";

export const BOARD_HELP_UNDO_VIEWER =
  "誤って完了した場合は管理者へ連絡し、履歴から「完了取り消し」を依頼してください。";

export const BOARD_HELP_UNDO_ADMIN =
  "管理者は履歴の「完了取り消し」で担当からの報告を記録したうえ、作業中に戻せます。";

/** `session.username` を差し込む */
export const MY_TASKS_HELP_SCOPE_TEMPLATE = (username: string) =>
  `マイタスクでは、ログイン中のユーザー（${username}）が担当する未完了タスクのみが表示されます。`;

export const MY_TASKS_HELP_INPUT =
  "スライダーで進捗％、テキストで進捗メモを入力できます。保存は一覧でまとめて実行します。メモ・％の更新は担当者または管理者のみです。";

export const MY_TASKS_HELP_CASE_VIEW =
  "生産ボード連携タスクは「案件内容（閲覧）」から案件の詳細を表示のみできます。";

export const MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER =
  "担当者・編集者が誤って工程を完了した場合は、管理者へ報告し、履歴から戻してもらってください。";
