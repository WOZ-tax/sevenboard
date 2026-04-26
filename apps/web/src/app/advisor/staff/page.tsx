"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Users,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils";

type StaffRow = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "advisor";
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number };
};

const ROLE_BADGE: Record<StaffRow["role"], string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  advisor: "bg-amber-100 text-amber-700 border-amber-200",
};

const ROLE_LABEL: Record<StaffRow["role"], string> = {
  owner: "事務所オーナー",
  advisor: "顧問スタッフ",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function InternalStaffPage() {
  return (
    <DashboardShell>
      <InternalStaffContent />
    </DashboardShell>
  );
}

function InternalStaffContent() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useIsClient();
  const queryClient = useQueryClient();

  // owner のみ閲覧可
  const canAccess = user?.role === "owner";
  useEffect(() => {
    if (hydrated && user && !canAccess) {
      router.push("/advisor");
    }
  }, [hydrated, user, canAccess, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["internal-users"],
    queryFn: () => api.internalUsers.list(),
    enabled: canAccess,
    staleTime: 30_000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["internal-users"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/advisor")}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            顧問先一覧
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Users className="h-6 w-6 text-[var(--color-primary)]" />
              事務所スタッフ管理
            </h1>
            <p className="text-sm text-muted-foreground">
              SEVENRICH 事務所の owner / advisor を管理します（CL 側ユーザーは各顧問先の設定画面へ）
            </p>
          </div>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
        >
          <Plus className="h-4 w-4" />
          スタッフを追加
        </Button>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">
            スタッフ一覧の取得に失敗しました。再読み込みしてください。
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>担当顧問先数</TableHead>
              <TableHead>登録日</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  読み込み中...
                </TableCell>
              </TableRow>
            ) : data && data.length > 0 ? (
              data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-normal", ROLE_BADGE[u.role])}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{u._count.memberships}件</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        aria-label="編集"
                        title="編集"
                        onClick={() => setEditTarget(u)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        aria-label="削除"
                        title="削除"
                        disabled={u.id === user?.id}
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  スタッフが登録されていません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CreateStaffDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      <EditStaffDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          setEditTarget(null);
          refresh();
        }}
      />

      <DeleteStaffDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

// ─── Create Staff Dialog ────────────────────────────────

function CreateStaffDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "advisor">("advisor");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
      setPassword("");
      setRole("advisor");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => api.internalUsers.create({ email, name, password, role }),
    onSuccess: () => onCreated(),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    if (!email || !name || password.length < 8) {
      setError("メールアドレス・名前・8文字以上のパスワードが必要です");
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>事務所スタッフを追加</DialogTitle>
            <DialogDescription>
              owner = 事務所全体管理 / advisor = 担当顧問先の閲覧編集。CL 側ユーザーはここから作成できません。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">
                メールアドレス <span className="text-red-500">*</span>
              </Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">
                名前 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">
                初期パスワード <span className="text-red-500">*</span>
              </Label>
              <Input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="8文字以上"
                required
              />
              <p className="text-xs text-muted-foreground">
                スタッフ本人がログイン後に変更してもらってください。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-role">
                ロール <span className="text-red-500">*</span>
              </Label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "owner" | "advisor")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="advisor">advisor（顧問スタッフ）</option>
                <option value="owner">owner（事務所オーナー）</option>
              </select>
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  追加中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  追加
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Staff Dialog ──────────────────────────────────

function EditStaffDialog({
  target,
  onClose,
  onUpdated,
}: {
  target: StaffRow | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "advisor">("advisor");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setRole(target.role);
      setPassword("");
      setError(null);
    }
  }, [target]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("no target");
      const payload: { name?: string; role?: "owner" | "advisor"; password?: string } = {};
      if (name !== target.name) payload.name = name;
      if (role !== target.role) payload.role = role;
      if (password) payload.password = password;
      return api.internalUsers.update(target.id, payload);
    },
    onSuccess: () => onUpdated(),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    if (password && password.length < 8) {
      setError("パスワードは 8 文字以上です");
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>スタッフを編集</DialogTitle>
            <DialogDescription>{target?.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-name">名前</Label>
              <Input
                id="edit-staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-role">ロール</Label>
              <select
                id="edit-staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "owner" | "advisor")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="advisor">advisor</option>
                <option value="owner">owner</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-password">パスワード再設定（任意）</Label>
              <Input
                id="edit-staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="変更しない場合は空欄"
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  更新中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Staff Dialog ────────────────────────────────

function DeleteStaffDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: StaffRow | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) setError(null);
  }, [target]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("no target");
      return api.internalUsers.remove(target.id);
    },
    onSuccess: () => onDeleted(),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    },
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-700">スタッフを削除</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{target?.name}</span>{" "}
            ({target?.email}) を削除します。担当している顧問先のアサイン (
            {target?._count.memberships}件) も解除されます。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                削除中...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                削除
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
