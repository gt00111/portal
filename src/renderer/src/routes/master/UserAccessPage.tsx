import { Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { APP_ROLES, type AppRole } from "@shared/auth.js";
import { GRANTABLE_APP_IDS } from "@shared/appIds.js";
import { PROCESS_VIEWS, PROCESS_VIEW_LABELS, type ProcessView } from "@shared/processView.js";
import type { MasterRow } from "@shared/master.js";
import type { GroupRole, UserAccessDetail, UserAppGrantRow } from "@shared/userAccess.js";
import { GROUP_ROLES } from "@shared/userAccess.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { invoke } from "@renderer/lib/api.js";
import { useToast } from "@renderer/components/ui/Toast.js";

const APP_LABELS: Record<(typeof GRANTABLE_APP_IDS)[number], string> = {
  "master-database": "マスターデータ",
  "seisan-board": "生産ボード",
  "parts-tracker": "部材管理",
  "drawing-library": "図面ライブラリ",
  "process-management": "工程管理",
  "pixo-converter": "PixoConverter",
};

const GROUP_ROLE_LABELS: Record<GroupRole, string> = {
  member: "一般",
  group_admin: "グループ管理者",
};

function grantMap(detail: UserAccessDetail): Map<string, UserAppGrantRow> {
  return new Map(detail.appGrants.map((g) => [g.appId, g]));
}

interface EditState {
  userNameId: number;
  userName: string;
  groupNameId: string;
  roleInGroup: GroupRole;
  grants: Map<string, { appRole: AppRole; processView: ProcessView }>;
}

export function UserAccessPage(): JSX.Element {
  const toast = useToast();
  const [users, setUsers] = useState<UserAccessDetail[]>([]);
  const [groups, setGroups] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [accessList, groupList] = await Promise.all([
        invoke<UserAccessDetail[]>("user-access:list"),
        invoke<MasterRow[]>("master:list", { table: "m_group_names" }),
      ]);
      setUsers(accessList);
      setGroups(groupList.filter((g) => g.isActive));
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openEdit(detail: UserAccessDetail): void {
    const grants = new Map<string, { appRole: AppRole; processView: ProcessView }>();
    for (const appId of GRANTABLE_APP_IDS) {
      const existing = grantMap(detail).get(appId);
      grants.set(appId, {
        appRole: existing?.appRole ?? "viewer",
        processView: existing?.processView ?? "both",
      });
    }
    setEdit({
      userNameId: detail.userNameId,
      userName: detail.userName,
      groupNameId: detail.groupMembership ? String(detail.groupMembership.groupNameId) : "",
      roleInGroup: detail.groupMembership?.roleInGroup ?? "member",
      grants,
    });
  }

  async function saveEdit(): Promise<void> {
    if (!edit) return;
    setSaving(true);
    try {
      const groupNameId =
        edit.groupNameId.trim() === "" ? null : Number.parseInt(edit.groupNameId, 10);
      await invoke("user-access:setGroupMembership", {
        userNameId: edit.userNameId,
        groupNameId,
        roleInGroup: edit.roleInGroup,
      });
      const grants: UserAppGrantRow[] = GRANTABLE_APP_IDS.map((appId) => {
        const g = edit.grants.get(appId)!;
        return {
          userNameId: edit.userNameId,
          appId,
          appRole: g.appRole,
          processView: appId === "process-management" ? g.processView : null,
        };
      });
      await invoke("user-access:saveAppGrants", { userNameId: edit.userNameId, grants });
      toast.push("success", `${edit.userName} の権限を保存しました。`);
      setEdit(null);
      await refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function summarizeGrants(detail: UserAccessDetail): string {
    if (detail.appGrants.length === 0) return "未設定";
    return detail.appGrants
      .map((g) => `${APP_LABELS[g.appId]}:${g.appRole}`)
      .join(" · ");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 shrink-0 text-accent-primary" size={20} />
          <div className="min-w-0 flex-1 text-sm text-fg-muted">
            <p>
              ログインとマスタユーザーの紐づけは操作者画面で行います。ここでは
              <strong className="text-fg-primary">グループ所属</strong>と
              <strong className="text-fg-primary">アプリ別の業務権限</strong>を編集します（ポータル管理者のみ）。
            </p>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-fg-muted">読み込み中…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border-subtle bg-bg-surface/80 text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2">ユーザー</th>
                <th className="px-3 py-2">ログイン</th>
                <th className="px-3 py-2">グループ</th>
                <th className="px-3 py-2">アプリ権限</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userNameId} className="border-b border-border-subtle/60">
                  <td className="px-3 py-2 font-medium">{u.userName}</td>
                  <td className="px-3 py-2 text-fg-muted">
                    {u.operatorId != null ? (u.operatorActive ? "有効" : "無効") : "未紐づけ"}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {u.groupMembership
                      ? `${u.groupMembership.groupName}（${GROUP_ROLE_LABELS[u.groupMembership.roleInGroup]}）`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">{summarizeGrants(u)}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      編集
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={edit != null}
        onClose={() => setEdit(null)}
        title={edit ? `${edit.userName} の権限` : ""}
      >
        {edit && (
          <div className="flex flex-col gap-4">
            <Select
              label="所属グループ（未選択で所属なし）"
              value={edit.groupNameId}
              onChange={(e) => setEdit({ ...edit, groupNameId: e.target.value })}
              options={[
                { value: "", label: "（なし）" },
                ...groups.map((g) => ({ value: String(g.id), label: g.name })),
              ]}
            />
            <Select
              label="グループ内の役割"
              value={edit.roleInGroup}
              onChange={(e) => setEdit({ ...edit, roleInGroup: e.target.value as GroupRole })}
              options={GROUP_ROLES.map((r) => ({ value: r, label: GROUP_ROLE_LABELS[r] }))}
              disabled={!edit.groupNameId}
            />
            <div className="space-y-3 border-t border-border-subtle pt-3">
              <p className="text-xs font-medium text-fg-subtle">アプリ別権限</p>
              {GRANTABLE_APP_IDS.map((appId) => {
                const g = edit.grants.get(appId)!;
                return (
                  <div
                    key={appId}
                    className="grid gap-2 rounded-lg border border-border-subtle p-3 sm:grid-cols-2"
                  >
                    <p className="text-sm font-medium sm:col-span-2">{APP_LABELS[appId]}</p>
                    <Select
                      label="権限"
                      value={g.appRole}
                      onChange={(e) => {
                        const next = new Map(edit.grants);
                        next.set(appId, { ...g, appRole: e.target.value as AppRole });
                        setEdit({ ...edit, grants: next });
                      }}
                      options={APP_ROLES.map((r) => ({ value: r, label: r }))}
                    />
                    {appId === "process-management" && (
                      <Select
                        label="工程表示"
                        value={g.processView}
                        onChange={(e) => {
                          const next = new Map(edit.grants);
                          next.set(appId, { ...g, processView: e.target.value as ProcessView });
                          setEdit({ ...edit, grants: next });
                        }}
                        options={PROCESS_VIEWS.map((v) => ({
                          value: v,
                          label: PROCESS_VIEW_LABELS[v],
                        }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>
                キャンセル
              </Button>
              <Button variant="primary" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}