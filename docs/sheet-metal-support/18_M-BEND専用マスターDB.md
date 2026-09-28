# M-BEND専用マスターDB（Phase 2）

## 目的

M-BEND固有の機械・金型情報をポータル共通マスターから分離し、CAMで必要になる形状・取付・機械適合情報を段階的に拡張できるようにする。

## 保存先と責務

- DBファイル: 中央DBと同じディレクトリの `m-bend.db`
- M-BEND: 機械、上型、下型、ホルダー・中間板、対応機械を管理する
- 板金支援: M-BENDが出力した加工条件・曲げ順・シミュレーション結果を参照する
- ポータル共通マスター: 初回移行元としてのみ使用する

## Phase 2で追加したテーブル

- `m_machines`
- `m_upper_tools`
- `m_lower_tools`
- `m_tool_holders`
- `m_upper_tool_machines`
- `m_lower_tool_machines`
- `m_tool_holder_machines`
- `migration_log`

## 初回移行

M-BEND画面の「共通マスターから取り込む」で、共通マスターの機械・上型・下型・ホルダーと対応機械をコピーする。取り込みは一度だけ実行でき、完了後の編集元はM-BEND専用DBとする。これにより、後から共通マスターの値でM-BEND側の補正値を誤って上書きしない。

## CAMへの受け渡し

「CAMファイル出力」およびM-BEND起動時に、`m-bend.db` の有効データから次のJSONを生成する。

- `machines.json`
- `upper-punches.json`
- `default-dies.json`
- `setups.json`

M-BEND本体は当面このJSONブリッジを読む。SQLiteをM-BEND本体から直接開かないため、DBロックや配置差異を避けられる。

## 次Phase以降

- STEPモデルの保存先とアップロード
- 上型先端中心・取付面、下型V溝中心・上面の基準定義
- XYZ補正値、回転角、モデル向き
- ホルダー・中間板の積層構成
- 実モデルを使用した干渉判定とシミュレーション
