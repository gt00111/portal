---
created: 2026-07-09
tags:
  - sheet-metal-support
  - ipc
related:
  - 10_システムアーキテクチャ設計.md
  - 14_DBスキーマ定義.md
  - ../ipc-channels.md
  - ../standards/STD-003_命名規則標準.md
  - ../standards/STD-004_モジュールアーキテクチャ標準.md
---

# 板金製造支援システム IPCチャンネル定義

本書は板金製造支援システムの IPC チャンネルを定義する。ポータル共通の規約（`../ipc-channels.md`）に従う。

- すべて **`module:action`** 形式。モジュール接頭辞は **`smsupport`**（sheet-metal-support）。
- レスポンスは **`{ success, data | error }`** で統一。全ハンドラは try/catch（Coding-Rules）。
- レンダラは常に `window.api.invoke(channel, payload)` を使用（Modular-Architecture-Rules）。
- ハンドラは `sheet-metal-support.handler.ts` の `register(ipcMain)` で登録し、`ipcMain.handle` のみ使用。

```ts
type IpcResponse<T> = { success: true; data: T } | { success: false; error: string };
```

---

# 1. 権限表記

| 表記 | 意味 |
|---|---|
| 🔒 login | ログイン必須 |
| ✏️ editor | `editor` 以上（設計者） |
| 👑 admin | `admin` のみ |

appId は `sheet-metal-support`。権限は `assertCanWriteApp("sheet-metal-support")` / `getAppRole` で判定する。

---

# 2. Phase 1（品番検索・図面表示）— 今回の実装対象

図面ライブラリ（`drawing-library.db`）・master 系を **read-only 参照** して品番検索と最新版 PDF 表示を行う。本 DB（`sheet-metal-support.db`）への書き込みは発生しない。

| チャネル | 権限 | Request | Response(`data`) | 備考 |
|---|---|---|---|---|
| `smsupport:status` | 🔒 | `undefined` | `{ ready: boolean }` | サテライトDB／図面ライブラリの利用可否 |
| `smsupport:searchCascadeOptions` | 🔒 | `{ customerId?; modelId? }` | `{ customers; models; partNumbers }` | 客先→機種→図番のカスケード候補 |
| `smsupport:searchParts` | 🔒 | `{ keyword?; customerId?; modelId?; partNumber?; page?; pageSize? }` | `{ items: PartSummary[]; total }` | 品番検索。最新版のみ返す |
| `smsupport:getPartDetail` | 🔒 | `{ partNumber }` | `PartDetail` | 部品詳細（図面メタ＋加工条件サマリ）。Phase 1 は図面メタのみ |
| `smsupport:getDrawingFile` | 🔒 | `{ drawingId }` | `{ fileName; base64 }` | 最新版 PDF を base64 取得（図面ライブラリ read-only 経路を再利用） |

```ts
interface PartSummary {
  partNumber: string;
  drawingId: number | null;
  customerName: string | null;
  model: string | null;
  revision: string | null;
  updatedAt: string | null;
}

interface PartDetail extends PartSummary {
  material?: string | null;
  thickness?: number | null;
  // Phase 2 以降で加工条件・技術ノート・加工履歴を追加
}
```

> 図面ライブラリの参照方式（新規 read-only IPC を図面ライブラリ側に追加するか、板金支援 Repository が `drawing-library.db` を直接読むか）は `../drawing-library/改良要件定義.md` REQ-DL-002 に従い設計時確定。いずれも **read-only**。

---

# 3. Phase 2（加工情報管理）

本 DB を正本として加工条件・技術ノート・加工履歴・更新履歴を管理する。

## 3.1 加工条件 `smsupport:processCondition:*`

| チャネル | 権限 | Request | Response(`data`) |
|---|---|---|---|
| `smsupport:processCondition:getByPart` | 🔒 | `{ partNumber }` | `ProcessCondition \| null` |
| `smsupport:processCondition:save` | ✏️ | `ProcessConditionInput` | `ProcessCondition` |

## 3.2 技術ノート `smsupport:technicalNote:*`

| チャネル | 権限 | Request | Response(`data`) |
|---|---|---|---|
| `smsupport:technicalNote:listByPart` | 🔒 | `{ partNumber }` | `TechnicalNote[]` |
| `smsupport:technicalNote:create` | ✏️ | `{ partNumber; noteType; body }` | `TechnicalNote` |
| `smsupport:technicalNote:update` | ✏️ | `{ id; body }` | `TechnicalNote` |
| `smsupport:technicalNote:delete` | ✏️ | `{ id }` | `{ id }`（論理削除） |

## 3.3 加工履歴 `smsupport:processHistory:*`

| チャネル | 権限 | Request | Response(`data`) |
|---|---|---|---|
| `smsupport:processHistory:listByPart` | 🔒 | `{ partNumber }` | `ProcessHistory[]` |
| `smsupport:processHistory:create` | ✏️ | `{ partNumber; processedAt; machineId?; isTest?; comment? }` | `ProcessHistory` |

## 3.4 更新履歴 `smsupport:revisionHistory:*`

| チャネル | 権限 | Request | Response(`data`) |
|---|---|---|---|
| `smsupport:revisionHistory:listByPart` | 🔒 | `{ partNumber }` | `RevisionHistory[]` |

> 更新履歴は加工条件等の保存時に Service 層が自動記録する（削除不可・API 経由の追加は不可）。

---

# 4. Phase 3〜4（シミュレーション・判断エンジン）— 将来

| チャネル | 権限 | Request | Response(`data`) | 備考 |
|---|---|---|---|---|
| `smsupport:simulation:run` | ✏️ | `{ partNumber; modelFilePath }` | `SimulationResult` | 判断エンジン一括実行（曲げ順・金型・干渉・評価・改善案） |
| `smsupport:simulation:get` | 🔒 | `{ partNumber }` | `SimulationResult \| null` | 保存済み結果の閲覧（SCR-001） |
| `smsupport:simulation:save` | ✏️ | `SimulationSaveInput` | `SimulationResult` | 設計者確認後の保存 |
| `smsupport:report:generate` | 🔒 | `{ partNumber }` | `ReportData` | DB から都度生成（レポートは保持しない） |

判断エンジンの返却は STD-009 に従い **結果／点数／理由／改善案** を必ず含む。

---

# 5. レイヤー対応（STD-004）

```text
Renderer(UI) → window.api.invoke("smsupport:...")
   → sheet-metal-support.handler.ts (IPC受付・入力チェック)
   → *.service.ts (業務ロジック・判断エンジン呼び出し・更新履歴記録)
   → *.repo.ts (sheet-metal-support.db への CRUD)
   → drawing-ref.repo.ts / master-ref.repo.ts (他DB read-only参照)
```
