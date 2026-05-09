import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileUp, FileDown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { showToast } from './Toaster'
import {
  CSV_IMPORT_HEADERS,
  CSV_IMPORT_COLUMN_DESCRIPTIONS,
  CSV_IMPORT_PART_NUMBER_ALIASES,
  isOptionalCsvImportColumn,
  type CsvImportHeader,
} from '@shared/seisan/csvImportFormat.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

interface CsvRow extends Record<CsvImportHeader, string> {
  rowNum: number;
}

interface RowError {
  rowNum: number;
  column: string;
  message: string;
}

function resolveCsvColumnIndices(headers: string[]): { indices: number[]; error: string | null } {
  const indices: number[] = [];
  const missing: string[] = [];
  for (const label of CSV_IMPORT_HEADERS) {
    if (label === "図面番号(品番)") {
      let idx = -1;
      for (const alt of CSV_IMPORT_PART_NUMBER_ALIASES) {
        const i = headers.indexOf(alt);
        if (i >= 0) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        missing.push("図面番号(品番)（従来どおり「品番」ヘッダーでも可）");
      }
      indices.push(idx);
    } else {
      const i = headers.indexOf(label);
      if (i < 0) {
        if (isOptionalCsvImportColumn(label)) {
          indices.push(-1);
        } else {
          missing.push(label);
          indices.push(-1);
        }
      } else {
        indices.push(i);
      }
    }
  }
  if (missing.length > 0) {
    return { indices: [], error: `ヘッダーに不足があります: ${missing.join(", ")}` };
  }
  return { indices, error: null };
}

function parseDateStr(s: string): string | null {
  const normalized = s.trim().replace(/[\/\.]/g, '-')
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return null
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current.trim())
  return result
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImported,
}: CsvImportDialogProps) {
  const [rows, setRows] = useState<CsvRow[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null)
  const [masterConnected, setMasterConnected] = useState<boolean | null>(null)
  const [masterCustomers, setMasterCustomers] = useState<Set<string>>(new Set())
  const [masterModels, setMasterModels] = useState<Set<string>>(new Set())
  const [masterPartNumbers, setMasterPartNumbers] = useState<Set<string>>(new Set())
  const [masterComponentNames, setMasterComponentNames] = useState<Set<string>>(new Set())
  const [masterGroups, setMasterGroups] = useState<Set<string>>(new Set())
  const [masterUsers, setMasterUsers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setMasterConnected(null)
    const api = window.api?.masterData
    if (!api) {
      setMasterConnected(false)
      return
    }
    Promise.all([
      api.customers().then((r) => {
        if (r.success && r.data) { setMasterCustomers(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
      api.allModels().then((r) => {
        if (r.success && r.data) { setMasterModels(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
      api.allPartNumbers().then((r) => {
        if (r.success && r.data) { setMasterPartNumbers(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
      api.allComponentNames().then((r) => {
        if (r.success && r.data) { setMasterComponentNames(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
      api.groupNames().then((r) => {
        if (r.success && r.data) { setMasterGroups(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
      api.userNames().then((r) => {
        if (r.success && r.data) { setMasterUsers(new Set(r.data.map((i) => i.name))); return r.data.length }
        return 0
      }),
    ]).then((counts) => {
      setMasterConnected(counts.some((c) => c > 0))
    }).catch(() => {
      setMasterConnected(false)
    })
  }, [open])

  const errors = useMemo<RowError[]>(() => {
    const errs: RowError[] = []
    for (const row of rows) {
      for (const h of CSV_IMPORT_HEADERS) {
        if (isOptionalCsvImportColumn(h)) continue
        const val = row[h] as string;
        if (!val || !val.trim()) {
          errs.push({ rowNum: row.rowNum, column: h, message: '空欄です' })
        }
      }
      if (row.客先.trim() && !masterCustomers.has(row.客先.trim())) {
        errs.push({ rowNum: row.rowNum, column: '客先', message: `「${row.客先.trim()}」はマスターDBに未登録です` })
      }
      if (row.機種.trim() && !masterModels.has(row.機種.trim())) {
        errs.push({ rowNum: row.rowNum, column: '機種', message: `「${row.機種.trim()}」はマスターDBに未登録です` })
      }
      const partVal = row["図面番号(品番)"].trim();
      if (partVal && !masterPartNumbers.has(partVal)) {
        errs.push({
          rowNum: row.rowNum,
          column: "図面番号(品番)",
          message: `「${partVal}」はマスターDBに未登録です`,
        });
      }
      if (row.名称.trim() && !masterComponentNames.has(row.名称.trim())) {
        errs.push({ rowNum: row.rowNum, column: '名称', message: `「${row.名称.trim()}」はマスターDBに未登録です` })
      }
      if (row.グループ.trim() && !masterGroups.has(row.グループ.trim())) {
        errs.push({ rowNum: row.rowNum, column: 'グループ', message: `「${row.グループ.trim()}」はマスターDBに未登録です` })
      }
      if (row.入力者.trim() && !masterUsers.has(row.入力者.trim())) {
        errs.push({ rowNum: row.rowNum, column: '入力者', message: `「${row.入力者.trim()}」はマスターDBに未登録です` })
      }
      if (row.納期.trim() && !parseDateStr(row.納期)) {
        errs.push({ rowNum: row.rowNum, column: '納期', message: '日付形式が不正です (例: 2026-06-30)' })
      }
    }
    return errs
  }, [rows, masterCustomers, masterModels, masterPartNumbers, masterComponentNames, masterGroups, masterUsers])

  const errorRowNums = useMemo(() => new Set(errors.map((e) => e.rowNum)), [errors])
  const errorsByRow = useMemo(() => {
    const m = new Map<number, RowError[]>()
    for (const e of errors) {
      if (!m.has(e.rowNum)) m.set(e.rowNum, [])
      m.get(e.rowNum)!.push(e)
    }
    return m
  }, [errors])

  const handleDownloadTemplate = useCallback(async () => {
    if (!window.api?.import) return
    const res = await window.api.import.downloadCsvTemplate()
    if (res.success) {
      showToast('CSVテンプレートを保存しました')
    } else if (res.error !== 'キャンセルされました') {
      showToast(res.error ?? 'テンプレートの保存に失敗しました')
    }
  }, [])

  const handleSelectFile = useCallback(async () => {
    if (!window.api?.import) return
    setHeaderError(null)
    setResult(null)
    const res = await window.api.import.selectCsv()
    if (!res.success || !res.data) return
    const lines = res.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim())
    if (lines.length < 2) {
      setHeaderError('データ行がありません。ヘッダー行の下にデータを入力してください。')
      setRows([])
      return
    }
    const headers = parseCsvLine(lines[0]);
    const { indices: colIdx, error: headerResolveError } = resolveCsvColumnIndices(headers);
    if (headerResolveError) {
      setHeaderError(headerResolveError);
      setRows([]);
      return;
    }
    const parsed: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      const row: CsvRow = {
        rowNum: i + 1,
        客先: cells[colIdx[0]] ?? "",
        機種: cells[colIdx[1]] ?? "",
        "図面番号(品番)": cells[colIdx[2]] ?? "",
        名称: cells[colIdx[3]] ?? "",
        号機: cells[colIdx[4]] ?? "",
        リビジョン: colIdx[5] >= 0 ? (cells[colIdx[5]] ?? "") : "",
        納期: cells[colIdx[6]] ?? "",
        内容: cells[colIdx[7]] ?? "",
        グループ: cells[colIdx[8]] ?? "",
        入力者: cells[colIdx[9]] ?? "",
      };
      parsed.push(row)
    }
    setRows(parsed)
  }, [])

  const handleImport = useCallback(async () => {
    if (!window.api?.projects || errors.length > 0 || rows.length === 0) return
    setImporting(true)
    setImportProgress(0)
    let ok = 0
    let fail = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setImportProgress(i + 1)
      const deadline = parseDateStr(row.納期)
      if (!deadline) {
        fail++
        continue
      }
      try {
        const rev = row.リビジョン.trim()
        const res = await window.api.projects.create({
          company_id: row.客先.trim(),
          model_type: row.機種.trim(),
          part_number: row["図面番号(品番)"].trim(),
          project_name: row.名称.trim(),
          unit_number: row.号機.trim(),
          ...(rev ? { revision: rev } : {}),
          deadline,
          request_content: row.内容.trim(),
          group_id: row.グループ.trim(),
          input_by_user_id: row.入力者.trim(),
        })
        if (res.success) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setResult({ ok, fail })
    setImporting(false)
    if (ok > 0) {
      showToast(`${ok} 件の案件をインポートしました`)
      onImported()
    }
  }, [rows, errors, onImported])

  const handleClose = (v: boolean) => {
    if (!v) {
      setRows([])
      setHeaderError(null)
      setResult(null)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>CSVインポート</DialogTitle>
          <DialogDescription>
            下記の列順・ルールに従った UTF-8 CSV を用意し、ファイルを選択してください。登録後の案件はすべて「下書き」です。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-3">
            <p className="font-medium text-foreground">CSV フォーマットの要点</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>文字コードは <strong className="text-foreground">UTF-8</strong>（Excel 利用時は BOM 付きを推奨。テンプレートは BOM 付きで保存されます）</li>
              <li>1 行目は次表の列名と一致する<strong className="text-foreground">ヘッダー行</strong>。2 行目以降がデータです。</li>
              <li>
                「図面番号(品番)」列のヘッダーは、従来どおり<strong className="text-foreground">「品番」</strong>のみでもインポートできます。
              </li>
              <li>
                客先・機種・品番・名称・グループ・入力者は、<strong className="text-foreground">マスターDBに登録済みの名称と完全一致</strong>する必要があります（接続後にこの画面で検証されます）。
              </li>
              <li>
                <strong className="text-foreground">「リビジョン」</strong>列は空欄でもよく、ヘッダー行から<strong className="text-foreground">列ごと省略した CSV（リビジョン追加前の形式）</strong>もそのままインポートできます。
              </li>
              <li>値にカンマを含める場合は、セルをダブルクォートで囲んでください。</li>
            </ul>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium w-[28%]">列名（1行目）</th>
                    <th className="px-2 py-1.5 text-left font-medium">説明</th>
                  </tr>
                </thead>
                <tbody>
                  {CSV_IMPORT_HEADERS.map((col) => (
                    <tr key={col} className="border-t">
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{col}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{CSV_IMPORT_COLUMN_DESCRIPTIONS[col]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={handleDownloadTemplate}>
                <FileDown className="mr-2 h-4 w-4" />
                CSVテンプレートをダウンロード
              </Button>
            </div>
          </div>

          {masterConnected === false && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">マスターDBが接続されていません</p>
                <p className="mt-1">CSVインポートにはマスターDBの接続が必要です。設定画面からマスターDBファイルを選択してください。</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSelectFile} disabled={importing || masterConnected === false || masterConnected === null}>
              <FileUp className="mr-2 h-4 w-4" />
              {masterConnected === null ? '読み込み中...' : 'CSVファイルを選択'}
            </Button>
            {rows.length > 0 && !result && (
              <span className="text-sm text-muted-foreground">{rows.length} 件のデータ</span>
            )}
          </div>

          {headerError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{headerError}</p>
            </div>
          )}

          {rows.length > 0 && !result && (
            <>
              {errors.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {errors.length} 件のエラーがあります（{errorRowNums.size} 行）。
                    エラーをすべて修正してから再度ファイルを選択してください。
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>すべてのデータが正常です。「一括登録」ボタンで登録できます。</p>
                </div>
              )}

              <div className="rounded-md border overflow-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">行</th>
                      {CSV_IMPORT_HEADERS.map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">エラー</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rowErrs = errorsByRow.get(row.rowNum) ?? []
                      const hasErr = rowErrs.length > 0
                      const errCols = new Set(rowErrs.map((e) => e.column))
                      return (
                        <tr key={row.rowNum} className={hasErr ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1 border-t text-muted-foreground">{row.rowNum}</td>
                          {CSV_IMPORT_HEADERS.map((h) => (
                            <td
                              key={h}
                              className={`px-2 py-1 border-t whitespace-nowrap ${
                                errCols.has(h) ? 'text-red-600 font-semibold' : ''
                              }`}
                            >
                              {(row as unknown as Record<string, unknown>)[h] as string || "—"}
                            </td>
                          ))}
                          <td className="px-2 py-1 border-t text-red-600 max-w-[200px]">
                            {rowErrs.map((e, i) => (
                              <span key={i} className="block">
                                {e.column}: {e.message}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">インポート完了</p>
                  <p>{result.ok} 件を登録しました。{result.fail > 0 ? `（${result.fail} 件失敗）` : ''}</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => handleClose(false)}>
                閉じる
              </Button>
            </div>
          )}
        </div>

        {rows.length > 0 && !result && (
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={errors.length > 0 || importing}>
              {importing ? `登録中... (${importProgress}/${rows.length})` : `一括登録（${rows.length} 件）`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
