"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { api, type TenantStaffRole } from "@/lib/api";
import {
  parseStaffPaste,
  staffCredentialsCsv,
  type StaffInput,
  type StaffPreview,
} from "@/lib/staff-bulk";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const roles: Record<TenantStaffRole, string> = {
  firm_advisor: "顧問スタッフ",
  firm_viewer: "閲覧者",
  firm_manager: "マネージャー",
  firm_admin: "管理者",
  firm_owner: "事務所オーナー",
};
const statuses = {
  new: "新規",
  existing: "事務所に追加",
  skip: "スキップ",
  error: "要修正",
};

// Mount only while open: initial passwords never enter shared query caches or browser storage.
export function BulkStaffDialog({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [role, setRole] = useState<TenantStaffRole>("firm_advisor");
  const [input, setInput] = useState<StaffInput[]>([]);
  const [preview, setPreview] = useState<StaffPreview | null>(null);
  const [result, setResult] = useState<StaffPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  async function run(register: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (register) {
        const saved = await api.tenantStaff.createBulk(tenantId, input, role);
        setResult(saved);
        onCreated();
      } else {
        const rows = parseStaffPaste(paste);
        const planned = await api.tenantStaff.previewBulk(tenantId, rows, role);
        setInput(rows);
        setPreview(planned);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([staffCredentialsCsv(result.rows)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "sevenboard-staff-initial-passwords.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const table = result ?? preview;
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
            {result ? "一括登録が完了しました" : "スタッフを一括登録"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "新規アカウントの初期パスワードを本人に共有してください。通知メールは送信されません。"
              : "名前とメールアドレスをまとめて貼り付けて登録します。1回100名まで。"}
          </DialogDescription>
        </DialogHeader>
        {!table ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-staff-paste">
                名前・メールアドレス（2列）
              </Label>
              <textarea
                id="bulk-staff-paste"
                rows={8}
                value={paste}
                disabled={busy}
                onChange={(e) => setPaste(e.target.value)}
                className="w-full rounded-md border bg-background p-3 text-sm"
                placeholder={
                  "山田 太郎\tyamada@example.com\n佐藤 花子\tsato@example.com"
                }
              />
              <p className="text-xs text-muted-foreground">
                Excelなどの2列をそのまま貼り付けるか、カンマ区切りで入力してください。見出し行は省略できます。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-staff-role">追加するスタッフのロール</Label>
              <select
                id="bulk-staff-role"
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value as TenantStaffRole)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              登録済みスタッフの名前・ロール・パスワードは変更しません。顧問先への担当割当は、登録後に管理ポータルで行います。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              新規 {table.newCount}名 ／ 事務所に追加 {table.existingCount}名 ／
              スキップ {table.skippedCount}名 ／ 要修正 {table.errorCount}名
            </p>
            <p className="text-sm">追加時のロール：{roles[role]}</p>
            {result?.newCount ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                初期パスワードはこの画面を閉じると再表示できません。CSVを保存し、本人に安全な方法で共有してください。
              </p>
            ) : null}
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {[
                      "行",
                      "名前 / メールアドレス",
                      "結果",
                      ...(result?.newCount ? ["初期パスワード"] : []),
                    ].map((label) => (
                      <th key={label} className="p-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.row} className="border-t">
                      <td className="p-3">{row.row}</td>
                      <td className="p-3 break-all">
                        {row.name}
                        <div className="text-xs text-muted-foreground">
                          {row.email}
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            row.status === "error"
                              ? "text-red-700"
                              : "font-medium"
                          }
                        >
                          {statuses[row.status]}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {row.message}
                        </div>
                      </td>
                      {result?.newCount ? (
                        <td className="p-3 select-all font-mono text-xs break-all">
                          {row.initialPassword ?? "—"}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
            <>
              {result.newCount > 0 && (
                <Button variant="outline" onClick={download}>
                  <Download className="h-4 w-4" />
                  初期パスワードCSVを保存
                </Button>
              )}
              <Button onClick={onClose}>閉じる</Button>
            </>
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
                {preview ? "入力を修正" : "キャンセル"}
              </Button>
              <Button
                disabled={
                  busy ||
                  (!!preview &&
                    (preview.errorCount > 0 ||
                      preview.newCount + preview.existingCount === 0))
                }
                onClick={() => run(!!preview)}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy
                  ? "処理中…"
                  : preview
                    ? `${preview.newCount + preview.existingCount}名を登録`
                    : "登録内容を確認"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
