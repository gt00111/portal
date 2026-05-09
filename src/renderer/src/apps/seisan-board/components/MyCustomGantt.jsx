import React, { useEffect, useMemo, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_VISIBLE_DAYS = 420
const DEFAULT_PRINT_TIME_SCALE = 'day'
const PRINT_TARGET_TOTAL_WIDTH = 1580

function toDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const d = new Date(String(value))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function buildMonthRange(start, end) {
  const months = []
  let cur = startOfMonth(start)
  const endMonth = startOfMonth(end)
  while (cur <= endMonth) {
    months.push(cur)
    cur = addMonths(cur, 1)
  }
  return months
}

function diffMonths(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function buildDateRange(start, end) {
  const dates = []
  let cur = start
  while (cur <= end) {
    dates.push(cur)
    cur = addDays(cur, 1)
  }
  return dates
}

function isWeekend(date) {
  const w = date.getDay()
  return w === 0 || w === 6
}

const JP_WEEK = ['日', '月', '火', '水', '木', '金', '土']

function diffDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime())
}

function getWorkingSegments(start, end, isNonWorkingDay) {
  const segments = []
  let cur = toDate(start)
  const endDate = toDate(end)

  while (cur <= endDate) {
    if (isNonWorkingDay(cur)) {
      cur = addDays(cur, 1)
      continue
    }

    const segStart = new Date(cur)
    let segEnd = new Date(cur)
    while (cur <= endDate && !isNonWorkingDay(cur)) {
      segEnd = new Date(cur)
      cur = addDays(cur, 1)
    }
    segments.push({ start: segStart, end: segEnd })
  }

  return segments
}

function dateToInputValue(date) {
  return formatKey(toDate(date))
}

function calcWorkingDuration(start, end, isNonWorkingDay) {
  return getWorkingSegments(start, end, isNonWorkingDay).reduce(
    (sum, seg) => sum + Math.max(1, diffDays(seg.start, seg.end) + 1),
    0
  )
}

function addWorkingDaysFrom(start, workingDays, isNonWorkingDay) {
  const days = Math.max(1, Number(workingDays) || 1)
  let cur = toDate(start)
  let counted = 0

  while (counted < days) {
    if (!isNonWorkingDay(cur)) counted += 1
    if (counted >= days) break
    cur = addDays(cur, 1)
  }
  return cur
}

/**
 * tasks: [{ id, text, start, end, type?, color? }]
 * - 同じ行で土日をまたぐバーを分割表示
 */
export default function MyCustomGantt({
  tasks = [],
  onTaskDateChange,
  onTaskDelete,
  onChildOrderChange,
  canDeleteTask = () => true,
  readOnly = false,
  holidayStorageKey = 'seisan:company-holidays',
  collapseScheduleColumnsByDefault = false,
  showProjectMetaColumns = false,
  printMode = false,
  maxVisibleDays = DEFAULT_MAX_VISIBLE_DAYS,
  printTimeScale = DEFAULT_PRINT_TIME_SCALE,
  forceViewStart,
  forceViewEnd,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedParentIds, setCollapsedParentIds] = useState(new Set())
  const [showScheduleColumns, setShowScheduleColumns] = useState(!collapseScheduleColumnsByDefault)
  const [draggingChildId, setDraggingChildId] = useState(null)
  const [dragOverChildId, setDragOverChildId] = useState(null)
  const [draftById, setDraftById] = useState({})
  const [customHolidays, setCustomHolidays] = useState(() => {
    try {
      const raw = localStorage.getItem(holidayStorageKey)
      if (!raw) return new Set()
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return new Set()
      return new Set(parsed)
    } catch {
      return new Set()
    }
  })

  const normalizedTasks = useMemo(() => {
    const today = toDate(new Date())
    return tasks.map((t) => {
      const startDateRaw = toDate(t.start)
      const endDateRaw = toDate(t.end)
      const safeStart = isValidDate(startDateRaw) ? startDateRaw : today
      const safeEnd = isValidDate(endDateRaw) ? endDateRaw : safeStart
      const [startDate, endDate] =
        safeEnd < safeStart ? [safeEnd, safeStart] : [safeStart, safeEnd]
      return {
        ...t,
        startDate,
        endDate,
      }
    })
  }, [tasks])

  const effectiveTimeScale = printMode ? printTimeScale : 'day'

  const { dates, isRangeCapped } = useMemo(() => {
    if (normalizedTasks.length === 0) return { dates: [], isRangeCapped: false }
    const dataMin = normalizedTasks.reduce((a, b) => (a.startDate < b.startDate ? a : b)).startDate
    const dataMax = normalizedTasks.reduce((a, b) => (a.endDate > b.endDate ? a : b)).endDate
    let min = dataMin
    let max = dataMax
    const hasForcedRange = Boolean(forceViewStart || forceViewEnd)
    if (hasForcedRange) {
      const forcedStart = forceViewStart ? toDate(forceViewStart) : dataMin
      const forcedEnd = forceViewEnd ? toDate(forceViewEnd) : dataMax
      min = forcedEnd < forcedStart ? forcedEnd : forcedStart
      max = forcedEnd < forcedStart ? forcedStart : forcedEnd
    }
    if (effectiveTimeScale === 'month') {
      const monthStart = startOfMonth(min)
      const monthEnd = startOfMonth(max)
      return { dates: buildMonthRange(monthStart, monthEnd), isRangeCapped: false }
    }
    const viewStart = hasForcedRange && printMode ? min : addDays(min, -1)
    const viewEnd = hasForcedRange && printMode ? max : addDays(max, 5)
    const totalDays = diffDays(viewStart, viewEnd) + 1
    if (totalDays > maxVisibleDays) {
      return {
        dates: buildDateRange(viewStart, addDays(viewStart, maxVisibleDays - 1)),
        isRangeCapped: true,
      }
    }
    return { dates: buildDateRange(viewStart, viewEnd), isRangeCapped: false }
  }, [normalizedTasks, maxVisibleDays, effectiveTimeScale, forceViewStart, forceViewEnd])

  const chartStart = dates[0]
  const colName = 190
  const colModel = 90
  const colPart = 90
  const colProjectName = 120
  const colUnit = 70
  const colStart = 120
  const colEnd = 120
  const colDuration = 92
  const hasMetaColumns = useMemo(() => {
    if (showProjectMetaColumns) return true
    return normalizedTasks.some(
      (t) => t.modelType != null || t.partNumber != null || t.unitNumber != null
    )
  }, [normalizedTasks, showProjectMetaColumns])
  const leftWidth =
    colName +
    (hasMetaColumns ? colModel + colPart + colProjectName + colUnit : 0) +
    (showScheduleColumns ? colStart + colEnd + colDuration : 0)
  const dayWidth = useMemo(() => {
    if (effectiveTimeScale === 'month') return 92
    if (!printMode) return 42
    if (!dates.length) return 30
    const fillWidth = Math.floor((PRINT_TARGET_TOTAL_WIDTH - leftWidth) / dates.length)
    return Math.max(18, Math.min(42, fillWidth))
  }, [effectiveTimeScale, printMode, dates.length, leftWidth])
  const rowHeight = printMode ? 35 : 40
  const targetChartWidth = printMode ? Math.max(0, PRINT_TARGET_TOTAL_WIDTH - leftWidth) : dates.length * dayWidth
  const fillerColumnCount =
    printMode && dayWidth > 0
      ? Math.max(0, Math.ceil((targetChartWidth - dates.length * dayWidth) / dayWidth))
      : 0
  const chartWidth = dates.length * dayWidth + fillerColumnCount * dayWidth
  const G = printMode ? '2px solid #6b7280' : undefined

  const parentIds = useMemo(
    () => normalizedTasks.filter((t) => t.type === 'project').map((t) => t.id),
    [normalizedTasks]
  )
  const hasMultiParents = parentIds.length > 1
  const hasChildren = normalizedTasks.length > 1

  const childCountByParent = useMemo(() => {
    const counts = new Map()
    for (const t of normalizedTasks) {
      if (t.parentId) {
        counts.set(t.parentId, (counts.get(t.parentId) ?? 0) + 1)
      }
    }
    if (!hasMultiParents && normalizedTasks.length > 1) {
      counts.set(normalizedTasks[0].id, normalizedTasks.length - 1)
    }
    return counts
  }, [normalizedTasks, hasMultiParents])

  const visibleTasks = useMemo(() => {
    if (printMode) {
      const hasForcedRange = Boolean(forceViewStart || forceViewEnd)
      if (!hasForcedRange) return normalizedTasks

      const rangeStart = forceViewStart ? toDate(forceViewStart) : normalizedTasks.reduce((a, b) => (a.startDate < b.startDate ? a : b)).startDate
      const rangeEnd = forceViewEnd ? toDate(forceViewEnd) : normalizedTasks.reduce((a, b) => (a.endDate > b.endDate ? a : b)).endDate
      const overlaps = (t) => t.endDate >= rangeStart && t.startDate <= rangeEnd

      const visibleChildParentIds = new Set()
      for (const t of normalizedTasks) {
        if (t.type !== 'project' && overlaps(t) && t.parentId) {
          visibleChildParentIds.add(t.parentId)
        }
      }

      return normalizedTasks.filter((t) => {
        if (t.type === 'project') return overlaps(t) || visibleChildParentIds.has(t.id)
        return overlaps(t)
      })
    }
    if (!hasMultiParents) {
      if (normalizedTasks.length <= 1) return normalizedTasks
      const [parent, ...children] = normalizedTasks
      return collapsed ? [parent] : [parent, ...children]
    }

    const result = []
    for (const task of normalizedTasks) {
      if (task.type === 'project') {
        result.push(task)
        continue
      }
      const parentId = task.parentId
      if (parentId && collapsedParentIds.has(parentId)) continue
      result.push(task)
    }
    return result
  }, [normalizedTasks, collapsed, hasMultiParents, collapsedParentIds, printMode, forceViewStart, forceViewEnd])

  const childIds = useMemo(() => {
    if (hasMultiParents) return []
    return normalizedTasks.slice(1).map((t) => t.id)
  }, [normalizedTasks, hasMultiParents])

  const commitChildReorder = (targetId) => {
    if (!draggingChildId || !targetId || draggingChildId === targetId) return
    const from = childIds.indexOf(draggingChildId)
    const to = childIds.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...childIds]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    if (onChildOrderChange) onChildOrderChange(next)
  }

  const isCustomHoliday = (date) => customHolidays.has(formatKey(date))
  const isNonWorkingDay = (date) => isWeekend(date) || isCustomHoliday(date)

  useEffect(() => {
    if (!hasMultiParents) return
    if (printMode) return
    setCollapsedParentIds(new Set(parentIds))
  }, [hasMultiParents, parentIds.join('|'), printMode])

  useEffect(() => {
    setShowScheduleColumns(!collapseScheduleColumnsByDefault)
  }, [collapseScheduleColumnsByDefault])

  useEffect(() => {
    const next = {}
    for (const t of normalizedTasks) {
      next[t.id] = {
        startDate: t.startDate,
        endDate: t.endDate,
        duration: calcWorkingDuration(t.startDate, t.endDate, isNonWorkingDay),
      }
    }
    setDraftById(next)
  }, [normalizedTasks, customHolidays])

  const toggleCustomHoliday = (date) => {
    if (isWeekend(date)) return
    const key = formatKey(date)
    setCustomHolidays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(holidayStorageKey, JSON.stringify(Array.from(next)))
      return next
    })
  }

  return (
    <div
      className={`w-full rounded-lg border border-slate-200 bg-white ${
        printMode ? 'gantt-print-root overflow-visible' : 'h-full overflow-auto'
      }`}
      style={{ border: G }}
    >
      {isRangeCapped ? (
        <div className={`${printMode ? 'print-hide' : ''} border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-800`}>
          表示期間が長いため、描画負荷を避けるために先頭から{maxVisibleDays}日までを表示しています。
        </div>
      ) : null}
      <div className={`min-w-max ${printMode ? 'gantt-print-inner' : ''}`}>
        <div className={`${printMode ? '' : 'sticky top-0 z-10'} flex border-b bg-white`} style={{ borderBottom: G }}>
          <div className="shrink-0 border-r bg-white sticky left-0 z-20" style={{ width: leftWidth, borderRight: G }}>
            <div
              className="grid"
              style={{
                gridTemplateColumns: [
                  `${colName}px`,
                  hasMetaColumns
                    ? `${colModel}px ${colPart}px ${colProjectName}px ${colUnit}px`
                    : '',
                  showScheduleColumns ? `${colStart}px ${colEnd}px ${colDuration}px` : '',
                ]
                  .join(' ')
                  .trim(),
              }}
            >
              <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs font-semibold text-slate-700">
                <span>工程名</span>
                <button
                  type="button"
                  className={`${printMode ? 'print-hide' : ''} rounded border px-1.5 py-0.5 text-[10px] font-normal text-slate-600 hover:bg-slate-100`}
                  onClick={() => setShowScheduleColumns((v) => !v)}
                  title={showScheduleColumns ? '開始日・終了日・期間を隠す' : '開始日・終了日・期間を表示'}
                >
                  {showScheduleColumns ? '日付列を隠す' : '日付列を表示'}
                </button>
              </div>
              {hasMetaColumns ? (
                <>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>機種</div>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>図面番号(品番)</div>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>名称</div>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>号機</div>
                </>
              ) : null}
              {showScheduleColumns ? (
                <>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>開始日</div>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>終了日</div>
                  <div className="border-l px-2 py-2 text-xs font-semibold text-slate-700" style={{ borderLeft: G }}>期間</div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex">
            {dates.map((d) => (
              <div
                key={formatKey(d)}
                className={`border-r px-1 py-2 text-center text-[10px] ${
                  effectiveTimeScale === 'month'
                    ? 'bg-white text-slate-700'
                    : isNonWorkingDay(d)
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-white text-slate-600'
                } ${effectiveTimeScale === 'month' || isWeekend(d) ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100'}`}
                style={{ width: dayWidth, borderRight: G }}
                title={
                  effectiveTimeScale === 'month'
                    ? '月表示'
                    : isWeekend(d)
                      ? '土日（非操業日）'
                      : 'クリックで会社休業日ON/OFF'
                }
                onClick={() => {
                  if (effectiveTimeScale !== 'month') toggleCustomHoliday(d)
                }}
              >
                {effectiveTimeScale === 'month' ? (
                  <>
                    <div className="text-[11px] font-semibold">{d.getFullYear()}</div>
                    <div>{d.getMonth() + 1}月</div>
                  </>
                ) : (
                  <>
                    <div>{d.getMonth() + 1}/{d.getDate()}</div>
                    <div>{JP_WEEK[d.getDay()]}</div>
                  </>
                )}
              </div>
            ))}
            {Array.from({ length: fillerColumnCount }).map((_, idx) => (
              <div
                key={`filler-header-${idx}`}
                className="border-r bg-white"
                style={{ width: dayWidth, borderRight: G }}
              />
            ))}
          </div>
        </div>

        {visibleTasks.map((task, index) => {
          const isParent = task.type === 'project' || (!hasMultiParents && index === 0 && normalizedTasks.length > 0)
          const canDragReorder = !hasMultiParents && !isParent
          const parentChildrenCount = childCountByParent.get(task.id) ?? 0
          const isCurrentParentCollapsed = hasMultiParents
            ? collapsedParentIds.has(task.id)
            : collapsed
          const draft = draftById[task.id] ?? {
            startDate: task.startDate,
            endDate: task.endDate,
            duration: calcWorkingDuration(task.startDate, task.endDate, isNonWorkingDay),
          }
          const viewStart = draft.startDate
          const viewEnd = draft.endDate
          const segments =
            task.type === 'milestone'
              ? [{ start: viewStart, end: viewStart }]
              : getWorkingSegments(viewStart, viewEnd, isNonWorkingDay)
          // 期間はバーの表示日数（分割後セグメントの合計）に合わせる
          const duration = draft.duration

          return (
            <div
              key={task.id}
              className={`flex ${printMode ? '' : 'border-b last:border-b-0'} ${!isParent && dragOverChildId === task.id ? 'bg-slate-50' : ''}`}
              onDragOver={(e) => {
                if (!canDragReorder || collapsed || !draggingChildId) return
                e.preventDefault()
                setDragOverChildId(task.id)
              }}
              onDrop={() => {
                if (!canDragReorder || collapsed) return
                commitChildReorder(task.id)
                setDragOverChildId(null)
                setDraggingChildId(null)
              }}
            >
              <div className={`shrink-0 border-r ${isParent ? 'bg-accent' : 'bg-white'} sticky left-0 z-[5]`} style={{ width: leftWidth, height: rowHeight, borderRight: G, borderBottom: G }}>
                <div
                  className="grid h-full items-center text-xs"
                  style={{
                    gridTemplateColumns: [
                      `${colName}px`,
                      hasMetaColumns
                        ? `${colModel}px ${colPart}px ${colProjectName}px ${colUnit}px`
                        : '',
                      showScheduleColumns ? `${colStart}px ${colEnd}px ${colDuration}px` : '',
                    ]
                      .join(' ')
                      .trim(),
                  }}
                >
                  <div className={`flex items-center gap-1 truncate px-2 ${isParent ? 'font-bold text-slate-900' : 'text-slate-800'}`}>
                    {isParent && parentChildrenCount > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 rounded px-1 text-[10px] text-slate-600 hover:bg-slate-100"
                        onClick={() => {
                          if (hasMultiParents) {
                            setCollapsedParentIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(task.id)) next.delete(task.id)
                              else next.add(task.id)
                              return next
                            })
                            return
                          }
                          setCollapsed((v) => !v)
                        }}
                        title={isCurrentParentCollapsed ? '展開' : '折りたたみ'}
                      >
                        {isCurrentParentCollapsed ? '▶' : '▼'}
                      </button>
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    {canDragReorder && !printMode && !readOnly ? (
                      <span
                        className="cursor-grab select-none text-slate-400 active:cursor-grabbing"
                        title="ドラッグで並び替え"
                        draggable
                        onDragStart={() => setDraggingChildId(task.id)}
                        onDragEnd={() => {
                          setDraggingChildId(null)
                          setDragOverChildId(null)
                        }}
                      >
                        ⋮⋮
                      </span>
                    ) : null}
                    {task.linkTo && !printMode ? (
                      <a
                        href={`#${task.linkTo}`}
                        className={`truncate underline-offset-2 hover:underline ${!isParent ? 'pl-1' : ''}`}
                        title="案件詳細を開く"
                      >
                        {task.text}
                      </a>
                    ) : (
                      <span className={`truncate ${!isParent ? 'pl-1' : ''}`}>{task.text}</span>
                    )}
                  </div>
                  {hasMetaColumns ? (
                    <>
                      <div className="border-l px-2 text-[11px] text-slate-600" style={{ borderLeft: G }}>{task.modelType ?? '-'}</div>
                      <div className="border-l px-2 text-[11px] text-slate-600" style={{ borderLeft: G }}>{task.partNumber ?? '-'}</div>
                      <div className="border-l px-2 text-[11px] text-slate-600" style={{ borderLeft: G }}>{task.projectName ?? '-'}</div>
                      <div className="border-l px-2 text-[11px] text-slate-600" style={{ borderLeft: G }}>{task.unitNumber ?? '-'}</div>
                    </>
                  ) : null}
                  {showScheduleColumns && !printMode ? (
                    <>
                      <div className="border-l px-2">
                        <input
                          type="date"
                          disabled={readOnly}
                          value={dateToInputValue(viewStart)}
                          className="w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] disabled:bg-slate-100 disabled:text-slate-400"
                          onChange={(e) => {
                            const nextStart = toDate(e.target.value)
                            const curEnd = draft.endDate
                            const safeEnd = curEnd < nextStart ? nextStart : curEnd
                            const nextDuration = calcWorkingDuration(nextStart, safeEnd, isNonWorkingDay)
                            setDraftById((prev) => ({
                              ...prev,
                              [task.id]: {
                                ...prev[task.id],
                                startDate: nextStart,
                                endDate: safeEnd,
                                duration: nextDuration,
                              },
                            }))
                          }}
                          onBlur={(e) => {
                            const cur = draftById[task.id]
                            if (onTaskDateChange && cur) onTaskDateChange(task.id, cur.startDate, cur.endDate)
                          }}
                        />
                      </div>
                      <div className="border-l px-2">
                        <input
                          type="date"
                          disabled={readOnly}
                          value={dateToInputValue(viewEnd)}
                          className="w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] disabled:bg-slate-100 disabled:text-slate-400"
                          onChange={(e) => {
                            const nextEnd = toDate(e.target.value)
                            const curStart = draft.startDate
                            const safeStart = nextEnd < curStart ? nextEnd : curStart
                            const nextDuration = calcWorkingDuration(safeStart, nextEnd, isNonWorkingDay)
                            setDraftById((prev) => ({
                              ...prev,
                              [task.id]: {
                                ...prev[task.id],
                                startDate: safeStart,
                                endDate: nextEnd,
                                duration: nextDuration,
                              },
                            }))
                          }}
                          onBlur={(e) => {
                            const cur = draftById[task.id]
                            if (onTaskDateChange && cur) onTaskDateChange(task.id, cur.startDate, cur.endDate)
                          }}
                        />
                      </div>
                      <div className="border-l px-2 text-right text-slate-600">
                        <div className="flex items-center justify-end gap-3">
                          <input
                            type="number"
                            min={1}
                            disabled={readOnly}
                            value={duration}
                            className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right text-[11px] disabled:bg-slate-100 disabled:text-slate-400"
                            onChange={(e) => {
                              const nextDuration = Math.max(1, parseInt(e.target.value || '1', 10) || 1)
                              const nextEnd = addWorkingDaysFrom(draft.startDate, nextDuration, isNonWorkingDay)
                              setDraftById((prev) => ({
                                ...prev,
                                [task.id]: {
                                  ...prev[task.id],
                                  startDate: draft.startDate,
                                  endDate: nextEnd,
                                  duration: nextDuration,
                                },
                              }))
                            }}
                            onBlur={(e) => {
                              const cur = draftById[task.id]
                              if (onTaskDateChange && cur) onTaskDateChange(task.id, cur.startDate, cur.endDate)
                            }}
                          />
                          {!readOnly && canDeleteTask(task) ? (
                            <button
                              type="button"
                              className="ml-2 text-red-500 hover:text-red-700"
                              onClick={() => onTaskDelete && onTaskDelete(task.id)}
                              title="削除"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className={`relative ${printMode ? 'overflow-visible' : 'overflow-hidden'}`} style={{ width: chartWidth, height: rowHeight }}>
                <div className="absolute inset-0 flex">
                  {dates.map((d) => (
                    <div
                      key={`${task.id}-${effectiveTimeScale === 'month' ? `${d.getFullYear()}-${d.getMonth() + 1}` : formatKey(d)}`}
                      className={`h-full border-r ${
                        effectiveTimeScale === 'month'
                          ? 'bg-white'
                          : isNonWorkingDay(d)
                            ? 'bg-slate-300'
                            : 'bg-white'
                      }`}
                      style={{ width: dayWidth, borderRight: G, borderBottom: G }}
                    />
                  ))}
                  {Array.from({ length: fillerColumnCount }).map((_, idx) => (
                    <div
                      key={`${task.id}-filler-${idx}`}
                      className="h-full border-r bg-white"
                      style={{ width: dayWidth, borderRight: G, borderBottom: G }}
                    />
                  ))}
                </div>

                <div className="absolute inset-0">
                  {segments.map((seg, idx) => {
                    const left =
                      effectiveTimeScale === 'month'
                        ? diffMonths(startOfMonth(chartStart), startOfMonth(seg.start)) * dayWidth + (printMode ? 0 : 2)
                        : diffDays(chartStart, seg.start) * dayWidth + (printMode ? 0 : 2)
                    const width =
                      effectiveTimeScale === 'month'
                        ? Math.max(
                            8,
                            (diffMonths(startOfMonth(seg.start), startOfMonth(seg.end)) + 1) * dayWidth - (printMode ? 0 : 4)
                          )
                        : Math.max(8, (diffDays(seg.start, seg.end) + 1) * dayWidth - (printMode ? 0 : 4))
                    return (
                      <div
                        key={`${task.id}-seg-${idx}`}
                        className="absolute top-1.5 h-7 rounded"
                        style={{ left, width, opacity: task.type === 'project' ? 0.85 : 1 }}
                        title={`${task.text}: ${dateToInputValue(seg.start)} - ${dateToInputValue(seg.end)}`}
                      >
                        <div
                          className={`h-7 w-full rounded ${task.color ? '' : isParent ? 'bg-sky-600' : 'bg-blue-500'}`}
                          style={task.color ? { backgroundColor: task.color } : undefined}
                        />
                        {idx === 0 ? (
                          <div className="pointer-events-none absolute inset-0 truncate px-2 pt-1 text-[10px] text-white">
                            {task.barLabel ?? task.text}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {normalizedTasks.length === 0 && (
          <div className="px-4 py-8 text-sm text-slate-500">工程がありません</div>
        )}
      </div>
    </div>
  )
}
