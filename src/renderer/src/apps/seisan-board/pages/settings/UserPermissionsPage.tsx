import { useEffect, useState, useCallback } from 'react'
import { showToast } from '../../components/Toaster'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Trash2, Plus, Shield, ShieldCheck, Eye, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

interface MasterItem { id: number; name: string }
interface UserPerm { user_name: string; role: string }

const ROLE_OPTIONS = [
  { value: 'viewer', label: '閲覧者', icon: Eye, description: 'スケジュール確認・ファイルDLのみ' },
  { value: 'editor', label: '編集者', icon: Shield, description: '案件作成・編集・工程移行・CSVインポート' },
  { value: 'approver', label: '承認者', icon: ShieldCheck, description: '承認ボタン＋その他の操作すべて' },
] as const

export function UserPermissionsPage() {
  const { canApprove } = useAuth()
  const [users, setUsers] = useState<MasterItem[]>([])
  const [perms, setPerms] = useState<UserPerm[]>([])
  const [addUser, setAddUser] = useState('')
  const [addRole, setAddRole] = useState('viewer')

  const load = useCallback(async () => {
    const [usersRes, permsRes] = await Promise.all([
      window.api?.masterData?.userNames(),
      window.api?.userPermissions?.list(),
    ])
    if (usersRes?.success && usersRes.data) setUsers(usersRes.data)
    if (permsRes?.success && permsRes.data) setPerms(permsRes.data)
  }, [])

  useEffect(() => { load() }, [load])

  const assignedNames = new Set(perms.map((p) => p.user_name))
  const availableUsers = users.filter((u) => !assignedNames.has(u.name))

  const handleAdd = async () => {
    if (!addUser) return
    const res = await window.api?.userPermissions?.setRole(addUser, addRole as 'viewer' | 'editor' | 'approver')
    if (res?.success) {
      showToast('権限を追加しました')
      setAddUser('')
      setAddRole('viewer')
      load()
    } else {
      showToast(res?.error ?? '追加に失敗しました')
    }
  }

  const handleChangeRole = async (userName: string, role: string) => {
    const res = await window.api?.userPermissions?.setRole(userName, role as 'viewer' | 'editor' | 'approver')
    if (res?.success) {
      showToast('権限を変更しました')
      load()
    } else {
      showToast(res?.error ?? '権限の変更に失敗しました')
    }
  }

  const handleRemove = async (userName: string) => {
    const res = await window.api?.userPermissions?.remove(userName)
    if (res?.success) {
      showToast('権限を削除しました（閲覧者に戻ります）')
      load()
    } else {
      showToast(res?.error ?? '権限の削除に失敗しました')
    }
  }

  if (!canApprove) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">権限がありません</p>
        <p className="text-sm text-muted-foreground">ユーザー権限の管理は承認者のみ行えます。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">ユーザー権限管理</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ユーザーごとの権限レベルを設定します。登録のないユーザーは自動的に「閲覧者」になります。
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">権限レベル</h3>
        <div className="grid grid-cols-3 gap-3">
          {ROLE_OPTIONS.map(({ value, label, icon: Icon, description }) => (
            <div key={value} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="text-sm font-medium">新規追加</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">ユーザー</Label>
            <Select value={addUser} onValueChange={setAddUser}>
              <SelectTrigger>
                <SelectValue placeholder="ユーザーを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.name}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40 space-y-1">
            <Label className="text-xs">権限</Label>
            <Select value={addRole} onValueChange={setAddRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!addUser} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            追加
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2 font-medium">ユーザー名</th>
              <th className="text-left px-4 py-2 font-medium">権限</th>
              <th className="w-20 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {perms.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  権限が設定されたユーザーはいません
                </td>
              </tr>
            )}
            {perms.map((p) => (
              <tr key={p.user_name} className="border-b last:border-0">
                <td className="px-4 py-2">{p.user_name}</td>
                <td className="px-4 py-2">
                  <Select value={p.role} onValueChange={(v) => handleChangeRole(p.user_name, v)}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(p.user_name)} title="削除">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
