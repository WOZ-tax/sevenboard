"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AssignmentPreview, AssignmentResult } from "@/lib/staff-bulk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Option = { id: string; name: string; detail?: string };
export function BulkAssignmentsDialog({
  tenantId,
  companies,
  onClose,
  onAssigned,
}: {
  tenantId: string;
  companies: Option[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const staff = useQuery({
    queryKey: ["tenant-staff", tenantId],
    queryFn: () => api.tenantStaff.list(tenantId),
  });
  const [orgIds, setOrgIds] = useState<string[]>([]),
    [userIds, setUserIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<AssignmentPreview | null>(null),
    [result, setResult] = useState<AssignmentResult | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function run(save: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (save) {
        setResult(
          await api.tenantStaff.assignBulk(tenantId, { orgIds, userIds }),
        );
        onAssigned();
      } else
        setPreview(
          await api.tenantStaff.previewAssignments(tenantId, {
            orgIds,
            userIds,
          }),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "割当に失敗しました");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {result ? "担当割当が完了しました" : "担当者を一括割当"}
          </DialogTitle>
          <DialogDescription>
            選んだすべての顧問先に、選んだスタッフ全員を追加します。既存の担当割当は保持します。
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <p role="status" className="rounded-md bg-muted p-4 text-sm">
            {result.companyCount}社・{result.staffCount}名を確認し、
            {result.addedCount}件を追加しました。登録済みの{result.skippedCount}
            件はスキップしました。
          </p>
        ) : preview ? (
          <div className="space-y-3">
            <p className="text-sm">
              担当者：{preview.staff.map((s) => s.name).join("、")}
            </p>
            <p className="rounded-md bg-muted p-3 text-sm">
              {preview.companies.length}社に {preview.addCount}
              件を追加します。対象の会社へのアクセス権が付与されます（閲覧者は閲覧のみ）。登録済み{" "}
              {preview.skippedCount}件は変更しません。
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-3">顧問先</th>
                    <th className="p-3">追加</th>
                    <th className="p-3">登録済み</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.companies.map((c) => (
                    <tr key={c.orgId} className="border-t">
                      <td className="p-3">{c.orgName}</td>
                      <td className="p-3">{c.addCount}名</td>
                      <td className="p-3">{c.skippedCount}名</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {staff.isPending ? (
              <p>スタッフを読み込み中…</p>
            ) : staff.isError ? (
              <div role="alert" className="text-sm text-red-700">
                スタッフを取得できませんでした。
                <Button variant="outline" onClick={() => staff.refetch()}>
                  再試行
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Picker
                  label="顧問先"
                  options={companies}
                  ids={orgIds}
                  onChange={setOrgIds}
                  limit={100}
                  disabled={busy}
                />
                <Picker
                  label="スタッフ"
                  options={(staff.data ?? [])
                    .filter((s) => s.status === "active")
                    .map((s) => ({ id: s.id, name: s.name, detail: s.email }))}
                  ids={userIds}
                  onChange={setUserIds}
                  limit={50}
                  disabled={busy}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              ここではSevenBoardの担当・アクセス権を追加します。ヘッダーの「主・R・記」はkintone側の登録内容です。
            </p>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>閉じる</Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (preview) {
                    setPreview(null);
                    setError("");
                  } else onClose();
                }}
              >
                {preview ? "選択に戻る" : "キャンセル"}
              </Button>
              <Button
                disabled={
                  busy ||
                  !orgIds.length ||
                  !userIds.length ||
                  !!(preview && !preview.addCount)
                }
                onClick={() => run(!!preview)}
              >
                {busy
                  ? "処理中…"
                  : preview
                    ? `${preview.addCount}件を割り当てる`
                    : "割当内容を確認"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  label,
  options,
  ids,
  onChange,
  limit,
  disabled,
}: {
  label: string;
  options: Option[];
  ids: string[];
  onChange: (ids: string[]) => void;
  limit: number;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const visible = options.filter((o) =>
    `${o.name} ${o.detail ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const merged = [...new Set([...ids, ...visible.map((o) => o.id)])];
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">
        {label}：{ids.length}件選択 / 上限{limit}件
      </legend>
      <Input
        aria-label={`${label}を検索`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`${label}を検索`}
      />
      <div className="flex gap-3 text-xs">
        <button
          type="button"
          className="text-primary underline disabled:opacity-40"
          disabled={merged.length > limit}
          onClick={() => onChange(merged)}
        >
          表示中をすべて選択
        </button>
        <button
          type="button"
          className="text-muted-foreground underline"
          onClick={() => onChange([])}
        >
          選択を解除
        </button>
      </div>
      <div className="h-60 overflow-y-auto rounded-md border">
        {visible.length ? (
          visible.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-2 border-b p-3 text-sm last:border-0 hover:bg-muted"
            >
              <input
                className="mt-1"
                type="checkbox"
                checked={ids.includes(option.id)}
                disabled={!ids.includes(option.id) && ids.length >= limit}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...ids, option.id]
                      : ids.filter((id) => id !== option.id),
                  )
                }
              />
              <span className="min-w-0 break-all">
                {option.name}
                {option.detail && (
                  <span className="block text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                )}
              </span>
            </label>
          ))
        ) : (
          <p className="p-3 text-sm text-muted-foreground">
            該当する{label}がありません
          </p>
        )}
      </div>
    </fieldset>
  );
}
