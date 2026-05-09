import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface ProjectListFilter {
  project_status?: string[]
  company_id?: string
  group_id?: string
  search?: string
  created_month?: string
}

interface FilterBarProps {
  companyOptions: string[]
  groupOptions: string[]
  filters: ProjectListFilter
  onFilterChange: (filters: ProjectListFilter) => void
}

const SEARCH_DEBOUNCE_MS = 300

export function FilterBar({ companyOptions, groupOptions, filters, onFilterChange }: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? '')

  useEffect(() => {
    setSearchInput(filters.search ?? '')
  }, [filters.search])

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim() || undefined
      if (trimmed !== filters.search) {
        onFilterChange({ ...filters, search: trimmed })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, filters])

  const handleReset = () => {
    setSearchInput('')
    onFilterChange({})
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="案件番号・客先・機種・図面番号(品番)・号機・内容で検索..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select
        value={filters.company_id ?? '__all__'}
        onValueChange={(v) =>
          onFilterChange({ ...filters, company_id: v === '__all__' ? undefined : v })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="客先" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">すべて</SelectItem>
          {companyOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.group_id ?? '__all__'}
        onValueChange={(v) =>
          onFilterChange({ ...filters, group_id: v === '__all__' ? undefined : v })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="グループ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">すべて</SelectItem>
          {groupOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.created_month ?? '__all__'}
        onValueChange={(v) =>
          onFilterChange({ ...filters, created_month: v === '__all__' ? undefined : v })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="登録月" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">登録月: すべて</SelectItem>
          {(() => {
            const months: { value: string; label: string }[] = []
            const now = new Date()
            for (let i = 0; i < 12; i++) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              months.push({ value: val, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
            }
            return months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))
          })()}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={handleReset}>
        リセット
      </Button>
    </div>
  )
}
