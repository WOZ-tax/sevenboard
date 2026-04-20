"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useSidebarConfig, ALWAYS_VISIBLE } from "@/lib/sidebar-config";
import { menuItems } from "@/components/layout/sidebar";
import {
  Settings,
  Building2,
  BellRing,
  Link2,
  Users,
  LayoutDashboard,
  Eye,
  EyeOff,
  RefreshCw,
  Unlink,
  Link,
  Loader2,
  AlertCircle,
  Send,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface NotificationSetting {
  id: string;
  label: string;
  enabled: boolean;
}

interface IntegrationStatus {
  provider: string;
  isConnected: boolean;
  lastSyncAt: string | null;
  syncStatus: string;
}

interface UserRecord {
  name: string;
  email: string;
  role: string;
  lastLogin: string;
}

import { useMfOffice } from "@/hooks/use-mf-data";

const initialNotifications: NotificationSetting[] = [
  { id: "budget", label: "予算超過アラート", enabled: true },
  { id: "cashflow", label: "資金繰りアラート", enabled: true },
  { id: "kpi", label: "KPI未達アラート", enabled: false },
  { id: "ai-report", label: "AIレポート自動生成", enabled: true },
];

const PROVIDER_META: Record<string, { name: string; description: string }> = {
  MF_CLOUD: {
    name: "MoneyForward クラウド会計",
    description: "クラウド会計データの自動連携",
  },
  FREEE: {
    name: "freee 会計",
    description: "会計・人事労務データの連携",
  },
  BOOKKEEPING_PLUGIN: {
    name: "kintone",
    description: "業務アプリとのデータ連携",
  },
};

const ALL_PROVIDERS = ["MF_CLOUD", "FREEE", "BOOKKEEPING_PLUGIN"];

const users: UserRecord[] = [
  { name: "田中 太郎", email: "tanaka@example.com", role: "管理者", lastLogin: "2026-04-05 10:30" },
  { name: "佐藤 花子", email: "sato@example.com", role: "編集者", lastLogin: "2026-04-04 15:20" },
  { name: "鈴木 一郎", email: "suzuki@example.com", role: "閲覧者", lastLogin: "2026-04-01 09:00" },
];

function useOrgId() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return "";
  return user?.orgId || "";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function IntegrationCard({
  provider,
  status,
  onConnect,
  onDisconnect,
  onSync,
  isSyncing,
  isConnecting,
  isDisconnecting,
}: {
  provider: string;
  status: IntegrationStatus | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  isSyncing: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
}) {
  const meta = PROVIDER_META[provider] || { name: provider, description: "" };
  const connected = status?.isConnected ?? false;
  const syncStatus = status?.syncStatus ?? "NEVER";
  const lastSyncAt = status?.lastSyncAt ?? null;
  const isBusy = isSyncing || isConnecting || isDisconnecting;

  const badgeNode = (() => {
    if (isSyncing || syncStatus === "IN_PROGRESS") {
      return (
        <Badge className="flex items-center gap-1 border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-yellow-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          同期中
        </Badge>
      );
    }
    if (connected && syncStatus === "FAILED") {
      return (
        <Badge className="flex items-center gap-1 border border-red-300 bg-red-100 px-2 py-0.5 text-red-700">
          <AlertCircle className="h-3 w-3" />
          エラー
        </Badge>
      );
    }
    if (connected) {
      return <Badge className="border border-[var(--color-success)] bg-[#e8f5e9] px-2 py-0.5 text-[var(--color-success)]">接続済み</Badge>;
    }
    return <Badge className="border border-[var(--color-border)] bg-[#f0eeec] px-2 py-0.5 text-[var(--color-text-secondary)]">未接続</Badge>;
  })();

  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {meta.name}
          </span>
          {badgeNode}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{meta.description}</div>
        {connected && lastSyncAt && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            最終同期: {formatDateTime(lastSyncAt)}
          </div>
        )}
        {connected && syncStatus === "FAILED" && (
          <div className="mt-0.5 text-xs text-red-600">
            同期に失敗しました。再実行してください。
          </div>
        )}
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-2">
        {connected ? (
          <>
            <Button variant="outline" size="sm" disabled={isBusy} onClick={onSync}>
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1">再同期</span>
            </Button>
            <Button variant="destructive" size="sm" disabled={isBusy} onClick={onDisconnect}>
              {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              <span className="ml-1">解除</span>
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            disabled={isBusy}
            onClick={onConnect}
          >
            {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
            <span className="ml-1">接続する</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(initialNotifications);
  const orgId = useOrgId();
  const mfOffice = useMfOffice();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());
  const [connectingProviders, setConnectingProviders] = useState<Set<string>>(new Set());
  const [disconnectingProviders, setDisconnectingProviders] = useState<Set<string>>(new Set());

  const { data: integrations } = useQuery({
    queryKey: ["integrations", orgId],
    queryFn: () => api.integrations.getAll(orgId),
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  // MF OAuth コールバック後の処理
  useEffect(() => {
    const mfStatus = searchParams.get("mf");
    if (mfStatus === "connected" || mfStatus === "error") {
      // Integration ステータスをリフレッシュ
      queryClient.invalidateQueries({ queryKey: ["integrations", orgId] });
      // URLからクエリパラメータを除去
      const url = new URL(window.location.href);
      url.searchParams.delete("mf");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [searchParams, queryClient, orgId]);

  const statusMap = new Map<string, IntegrationStatus>();
  if (integrations) {
    for (const item of integrations) statusMap.set(item.provider, item);
  }

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["integrations", orgId] });
  }, [queryClient, orgId]);

  // MF_CLOUD の場合は OAuth フローを使う
  const handleConnect = useCallback(async (provider: string) => {
    if (provider === "MF_CLOUD") {
      setConnectingProviders((prev) => new Set(prev).add(provider));
      try {
        const { authUrl } = await api.mfOAuth.getAuthUrl(orgId);
        window.location.href = authUrl;
      } catch {
        setConnectingProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
      return;
    }
    connectMutation.mutate(provider);
  }, [orgId]);

  const connectMutation = useMutation({
    mutationFn: (provider: string) => api.integrations.connect(orgId, provider),
    onMutate: (provider) => setConnectingProviders((prev) => new Set(prev).add(provider)),
    onSettled: (_data, _err, provider) => {
      setConnectingProviders((prev) => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
      invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (provider: string) => api.integrations.disconnect(orgId, provider),
    onMutate: (provider) => setDisconnectingProviders((prev) => new Set(prev).add(provider)),
    onSettled: (_data, _err, provider) => {
      setDisconnectingProviders((prev) => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
      invalidate();
    },
  });

  const syncMutation = useMutation({
    mutationFn: (provider: string) => api.integrations.sync(orgId, provider),
    onMutate: (provider) => setSyncingProviders((prev) => new Set(prev).add(provider)),
    onSettled: (_data, _err, provider) => {
      setSyncingProviders((prev) => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
      invalidate();
    },
  });

  const toggleNotification = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n))
    );
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-[var(--color-tertiary)]" />
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">設定</h1>
            <p className="text-sm text-muted-foreground">システム設定と外部連携管理</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <Building2 className="h-4 w-4" />
              会社情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mfOffice.isLoading ? (
              <div className="h-12 animate-pulse rounded bg-muted" />
            ) : mfOffice.data ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div><div className="text-xs text-muted-foreground">会社名</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.display_name || mfOffice.data.name || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">事業年度開始</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.accounting_periods?.[0]?.start_month ? `${mfOffice.data.accounting_periods[0].start_month}月` : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">業種</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.industry_class || "—"}</div></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">MFクラウド会計を接続すると会社情報が表示されます</p>
            )}
          </CardContent>
        </Card>

        <BriefingPushCard orgId={orgId} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <BellRing className="h-4 w-4" />
              通知設定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {notifications.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border px-4 py-3">
                  <span className="text-sm text-[var(--color-text-primary)]">{item.label}</span>
                  <button
                    role="switch"
                    aria-checked={item.enabled}
                    aria-label={item.label}
                    className={cn(
                      "relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors",
                      item.enabled ? "bg-[var(--color-primary)]" : "bg-gray-200"
                    )}
                    onClick={() => toggleNotification(item.id)}
                  >
                    <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", item.enabled ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <Link2 className="h-4 w-4" />
              データ連携
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ALL_PROVIDERS.map((provider) => (
                <IntegrationCard
                  key={provider}
                  provider={provider}
                  status={statusMap.get(provider)}
                  onConnect={() => handleConnect(provider)}
                  onDisconnect={() => disconnectMutation.mutate(provider)}
                  onSync={() => syncMutation.mutate(provider)}
                  isSyncing={syncingProviders.has(provider)}
                  isConnecting={connectingProviders.has(provider)}
                  isDisconnecting={disconnectingProviders.has(provider)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
              <Users className="h-4 w-4" />
              ユーザー一覧
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--color-background)] border-b-2 border-[var(--color-border)]">
                    <TableHead className="font-semibold text-[var(--color-text-primary)]">氏名</TableHead>
                    <TableHead className="font-semibold text-[var(--color-text-primary)]">メールアドレス</TableHead>
                    <TableHead className="font-semibold text-[var(--color-text-primary)]">役割</TableHead>
                    <TableHead className="font-semibold text-[var(--color-text-primary)]">最終ログイン</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell className="text-sm font-medium text-[var(--color-text-primary)]">{user.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                      <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.lastLogin}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <MenuVisibilitySettings />
      </div>
    </DashboardShell>
  );
}

function BriefingPushCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-push-config", orgId],
    queryFn: () => api.briefing.getPushConfig(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(8);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setHour(data.hourJst);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: {
      enabled?: boolean;
      hourJst?: number;
      webhookUrl?: string | null;
    }) => api.briefing.updatePushConfig(orgId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["briefing-push-config", orgId],
      });
      setWebhookUrl("");
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.briefing.pushTest(orgId),
    onSuccess: (res) =>
      setTestResult(
        res.sent ? "テスト送信に成功しました" : `送信できません: ${res.reason}`,
      ),
    onError: (err) =>
      setTestResult(
        `送信失敗: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  if (!orgId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Send className="h-4 w-4" />
          朝サマリーのSlack定時配信
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <div className="text-sm text-[var(--color-text-primary)]">
                  定時配信
                </div>
                <div className="text-xs text-muted-foreground">
                  {data?.webhookConfigured
                    ? "Webhookは設定済み"
                    : "Webhookを設定すると有効化できます"}
                </div>
              </div>
              <button
                role="switch"
                aria-checked={enabled}
                aria-label="サマリー定時配信"
                disabled={!data?.webhookConfigured && !enabled}
                className={cn(
                  "relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors",
                  enabled ? "bg-[var(--color-primary)]" : "bg-gray-200",
                  !data?.webhookConfigured && !enabled && "opacity-50",
                )}
                onClick={() => {
                  const next = !enabled;
                  setEnabled(next);
                  saveMutation.mutate({ enabled: next });
                }}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                    enabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-md border px-4 py-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm text-[var(--color-text-primary)]">
                配信時刻 (JST)
              </div>
              <select
                value={hour}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setHour(v);
                  saveMutation.mutate({ hourJst: v });
                }}
                className="ml-auto h-8 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-md border px-4 py-3">
              <div className="text-sm text-[var(--color-text-primary)]">
                Slack Incoming Webhook URL
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data?.webhookConfigured
                  ? "設定済み。上書きするには新しいURLを入力してください。空欄で保存すると削除されます。"
                  : "Slackの Incoming Webhook URL を入力してください。"}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() =>
                    saveMutation.mutate({ webhookUrl: webhookUrl || null })
                  }
                  disabled={saveMutation.isPending}
                >
                  保存
                </Button>
                {data?.webhookConfigured && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      saveMutation.mutate({ webhookUrl: null })
                    }
                    disabled={saveMutation.isPending}
                  >
                    削除
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="text-sm text-[var(--color-text-primary)]">
                今すぐテスト送信
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTestResult(null);
                  testMutation.mutate();
                }}
                disabled={
                  testMutation.isPending || !data?.webhookConfigured
                }
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">送信</span>
              </Button>
            </div>
            {testResult && (
              <p className="text-xs text-muted-foreground">{testResult}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MenuVisibilitySettings() {
  const { isHidden, toggle, hydrate } = useSidebarConfig();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <LayoutDashboard className="h-4 w-4" />
          メニュー表示設定
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          サイドバーに表示するメニューを選択できます。ダッシュボードと設定は常に表示されます。
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => {
            const locked = ALWAYS_VISIBLE.has(item.href);
            const hidden = isHidden(item.href);
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                disabled={locked}
                onClick={() => toggle(item.href)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors text-left",
                  locked
                    ? "cursor-not-allowed border-[var(--color-border)] bg-muted/50 text-muted-foreground"
                    : hidden
                      ? "border-dashed border-[var(--color-border)] text-muted-foreground hover:bg-muted/30"
                      : "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 text-[var(--color-text-primary)] hover:bg-[var(--color-primary)]/10"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {locked ? (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                ) : hidden ? (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
