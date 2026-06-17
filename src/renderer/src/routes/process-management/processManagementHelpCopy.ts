/** 工程管理のヘルプ・ページ冒頭用文言 */

export const DASHBOARD_PAGE_TAGLINE =
  "自グループの工程タスクのいまと当月の傾向を、KPI・表・通知ブロックで確認します。";

export const BOARD_PAGE_TAGLINE =
  "全員が同じ一覧で工程の進みを確認できます。案件の正は生産ボードです。";

export const MY_TASKS_PAGE_TAGLINE =
  "あなたが担当する未完了タスクだけが表示されます。進捗％とメモは一覧でまとめて保存します。";

export const HELP_DB_STORAGE_NOTE =
  "工程データはポータルと同じデータフォルダの process-management.db に保存されます。";

export const BOARD_HELP_OVERVIEW =
  "ボードタブでは、ログインユーザーごとに一覧を変えず、全員が同じ工程状況を見ます。案件名・客先・工程・担当で絞り込めます。";

export const BOARD_HELP_PROGRESS =
  "担当者がマイタスクで入力した進捗（0〜100％）と進捗メモを一覧で共有します。メモ未記入の行は表示で区別されます。案件列の「案件内容」から生産ボードの案件詳細を閲覧できます。";

export const BOARD_HELP_VIEW_ACTIVE_TEMPLATE = (processLabel: string) =>
  `アクティブ一覧に表示する工程は、アカウントの工程表示設定（現在：${processLabel}）に連動します。`;

export const BOARD_HELP_HISTORY =
  "表示モード「履歴」では SolidWorks / CADMAC / 両方を切り替え、完了したタスクだけを確認できます。一覧に着手・完了日時の列が表示され、列ヘッダで並び替えできます（既定は完了日時の新しい順）。";

export const BOARD_HELP_ACTIVE_HISTORY_HINT =
  "アクティブ＝完了以外のタスク（一時中断を含む）。履歴＝完了済みのみ。並行モードでは引渡しごとに CADMAC が一時中断で受け取り、主担当が再開して作業します。SW 未完了時の区切りも一時中断です。";

export const BOARD_HELP_PARALLEL =
  "並行モードは SolidWorks 主担当が切替。引渡しはバッチ連番＋メモ必須で、CADMAC は一時中断状態で受け取ります。SW 行の「補助」から補助担当を複数登録でき、引渡し後も進捗・メモを更新できます。ガント日数が変わると「計画（所要日数）に変更がありました」と表示されます。管理者は「ガント工程名」でテンプレート名の対応を変更できます。";

export const BOARD_HELP_LIFECYCLE =
  "開始・完了・一時中断・再開は、そのタスクの主担当（着手した人）のみが実行できます。上長（editor）は並行設定・補助担当・CADへ受渡しのみ担当外の行から操作できます。緊急時の代理は管理者（admin）のみです。";

export const BOARD_HELP_UNDO_VIEWER =
  "誤って完了した場合は管理者へ連絡し、履歴から「完了取り消し」を依頼してください。";

export const BOARD_HELP_UNDO_ADMIN =
  "管理者は履歴の「完了取り消し」で、担当からの報告を記録したうえ作業中に戻せます。";

export const MY_TASKS_HELP_SCOPE_TEMPLATE = (username: string) =>
  `マイタスクでは、ログイン中のユーザー（${username}）が担当する未完了タスクのみが表示されます。`;

export const MY_TASKS_HELP_INPUT =
  "スライダーで進捗％、テキストで進捗メモを入力し、一覧でまとめて保存します。更新は担当者または管理者のみ可能です。SolidWorks 主担当のカードでは、登録済みの補助担当それぞれの進捗％・メモを閲覧できます（編集は補助担当本人のみ）。";

export const MY_TASKS_HELP_CASE_VIEW =
  "生産ボード連携タスクは「案件内容（閲覧）」から案件詳細を開けます（編集は生産ボード側）。";

export const MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER =
  "誤って工程を完了した場合は管理者へ報告し、ボードの履歴から戻してもらってください。";

/** ダッシュボード — KPI・ブロックの見方のみ（操作手順なし） */
export const HELP_DASHBOARD_SECTIONS = [
  {
    title: "現在の状況（4カード）",
    items: [
      "作業中 ― ステータスが「作業中」のタスク数（全体）",
      "一時中断 ― 「一時中断」（CAD 引渡し待ち等）のタスク数",
      "未着手（全体） ― まだ着手していないタスク数",
      "自分の未着手 ― ログイン中の自分が主担当で、未着手のタスク数",
    ],
  },
  {
    title: "分析サマリー（当月・4カード）",
    items: [
      "放置タスク ― 7日以上更新がない未完了タスク。クリックで一覧",
      "今月完了 ― 今月完了したタスク件数",
      "今月平均 ― 今月完了タスクの平均作業日数",
      "並行率 ― SolidWorks と CADMAC を並行した案件の割合（％）",
    ],
  },
  {
    title: "メンバーの作業状況",
    body:
      "自グループメンバーごとに、作業中 / 一時中断 / 未着手 / 補助 の件数を表で表示します。",
  },
  {
    title: "工程別分析",
    body:
      "設計・レーザーデータ作成など工程タイプごとに、今月完了数・平均作業日数・一時中断・作業中を表示します。",
  },
  {
    title: "通知（未確認）",
    body: "CAD へ受渡し / ガント変更 / 完了報告の未確認通知を分類表示します。",
  },
  {
    title: "自分の担当・クイックリンク",
    body: "今日着手・今日完了・未着手（主担当）の件数と、主担当タスクの抜粋一覧です。",
  },
] as const;
