"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useScopedOrgId } from "@/hooks/use-scoped-org-id";
import { useSidebarConfig, ALWAYS_VISIBLE } from "@/lib/sidebar-config";
import { menuItems } from "@/components/layout/sidebar";
import {
  Settings,
  Building2,
  BellRing,
  Link2,
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
  Gauge,
  Plus,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CERTAINTY_LEVELS,
  CERTAINTY_LABEL,
  DEFAULT_CERTAINTY_RULES,
  type CertaintyLevel,
} from "@/lib/cashflow-certainty";

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

import { useMfOffice } from "@/hooks/use-mf-data";

const initialNotifications: NotificationSetting[] = [
  { id: "budget", label: "予算超過アラート", enabled: true },
  { id: "cashflow", label: "資金繰りアラート", enabled: true },
  { id: "kpi", label: "KPI未達アラート", enabled: false },
  { id: "ai-report", label: "AI CFOレポート自動生成", enabled: true },
];

const PROVIDER_META: Record<string, { name: string; description: string }> = {
  MF_CLOUD: {
    name: "MoneyForward クラウド会計",
    description: "クラウド会計データの自動連携",
  },
  BOOKKEEPING_PLUGIN: {
    name: "kintone",
    description: "業務アプリとのデータ連携",
  },
};

// FREEE は接続機能未実装なので一時的に除外（本番に偽 authUrl が出ないように）
const ALL_PROVIDERS = ["MF_CLOUD", "BOOKKEEPING_PLUGIN"];


function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function IntegrationCard({
  provider,
  status,
  mfStatus,
  onConnect,
  onDisconnect,
  onSync,
  onRefreshToken,
  isSyncing,
  isConnecting,
  isDisconnecting,
  isRefreshingToken,
}: {
  provider: string;
  status: IntegrationStatus | undefined;
  mfStatus?: {
    expiresAt?: string | null;
    lastRefreshedAt?: string | null;
  };
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onRefreshToken?: () => void;
  isSyncing: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isRefreshingToken?: boolean;
}) {
  const meta = PROVIDER_META[provider] || { name: provider, description: "" };
  const connected = status?.isConnected ?? false;
  const syncStatus = status?.syncStatus ?? "NEVER";
  const lastSyncAt = status?.lastSyncAt ?? null;
  const isBusy = isSyncing || isConnecting || isDisconnecting || !!isRefreshingToken;

  // 期限が 5 分以内なら警告色で表示（factory-hybrid-v2 と同仕様）
  const expiresAtMs = mfStatus?.expiresAt ? new Date(mfStatus.expiresAt).getTime() : null;
  const expiresSoon =
    expiresAtMs != null && expiresAtMs - Date.now() < 5 * 60 * 1000;

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
        {connected && mfStatus?.expiresAt && (
          <div
            className={cn(
              "mt-0.5 text-xs",
              expiresSoon ? "text-amber-700" : "text-muted-foreground",
            )}
          >
            トークン有効期限: {formatDateTime(mfStatus.expiresAt)}
            {expiresSoon && "（もうすぐ失効）"}
          </div>
        )}
        {connected && mfStatus?.lastRefreshedAt && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            トークン最終更新: {formatDateTime(mfStatus.lastRefreshedAt)}
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
            {onRefreshToken && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={onRefreshToken}
                title="既存の refresh_token を使って access_token を更新（OAuth 再認可は不要）"
              >
                {isRefreshingToken ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">トークン更新</span>
              </Button>
            )}
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
  const orgId = useScopedOrgId();
  const mfOffice = useMfOffice();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [syncingProviders, setSyncingProviders] = useState<Set<string>>(new Set());
  const [connectingProviders, setConnectingProviders] = useState<Set<string>>(new Set());
  const [disconnectingProviders, setDisconnectingProviders] = useState<Set<string>>(new Set());
  const [connectError, setConnectError] = useState<{
    provider: string;
    message: string;
  } | null>(null);
  // OAuth コールバック由来のエラーは URL から派生させ、ユーザーが閉じるまで保持する。
  // useEffect 内で setState すると React 19 の react-hooks/set-state-in-effect に弾かれるため、
  // useMemo で derive + dismiss flag で消す方式にする。
  const [callbackErrorDismissed, setCallbackErrorDismissed] = useState(false);

  const { data: integrations } = useQuery({
    queryKey: ["integrations", orgId],
    queryFn: () => api.integrations.getAll(orgId),
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  const mfStatus = searchParams.get("mf");
  const mfReason = searchParams.get("reason");

  // OAuth コールバック由来のエラーを URL から derive。
  // history.replaceState で URL を消しても useSearchParams は再評価されないので、
  // ユーザーが「閉じる」を押すまで mfStatus は "error" のまま残り続けてバナー表示が保たれる。
  const callbackError = useMemo(() => {
    if (mfStatus !== "error" || callbackErrorDismissed) return null;
    const reasonLabel: Record<string, string> = {
      access_denied: "対象の顧問先への access 権限がありません",
      invalid_state: "認証 state の検証に失敗しました（時間切れ・再送など）",
      missing_params: "認可サーバーからのパラメータが欠落しています",
      token_exchange: "MF Cloud のトークン交換に失敗しました",
    };
    const reason = mfReason || "unknown";
    return {
      provider: "MF_CLOUD",
      message: `MF Cloud 接続に失敗: ${reasonLabel[reason] ?? reason}`,
    };
  }, [mfStatus, mfReason, callbackErrorDismissed]);

  const displayError = connectError ?? callbackError;

  // 副作用: integrations キャッシュ破棄 + URL クエリ除去のみ。
  // setState はここでは呼ばない（react-hooks/set-state-in-effect 対策）。
  useEffect(() => {
    if (mfStatus === "connected" || mfStatus === "error") {
      queryClient.invalidateQueries({ queryKey: ["integrations", orgId] });
      const url = new URL(window.location.href);
      url.searchParams.delete("mf");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [mfStatus, queryClient, orgId]);

  const dismissError = useCallback(() => {
    setConnectError(null);
    setCallbackErrorDismissed(true);
  }, []);

  const statusMap = new Map<string, IntegrationStatus>();
  if (integrations) {
    for (const item of integrations) statusMap.set(item.provider, item);
  }

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["integrations", orgId] });
  }, [queryClient, orgId]);

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

  // MF_CLOUD の場合は OAuth フローを使う
  const handleConnect = useCallback(async (provider: string) => {
    setConnectError(null);
    setCallbackErrorDismissed(true);
    if (!orgId) {
      setConnectError({
        provider,
        message:
          "顧問先が選択されていません。ヘッダーの「顧問先一覧」から接続したい顧問先を開いてから接続してください。",
      });
      return;
    }
    if (provider === "MF_CLOUD") {
      setConnectingProviders((prev) => new Set(prev).add(provider));
      try {
        const { authUrl } = await api.mfOAuth.getAuthUrl(orgId);
        window.location.href = authUrl;
      } catch (err) {
        setConnectingProviders((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
        const message =
          err instanceof Error && err.message
            ? err.message
            : "MF Cloud の認可URLを取得できませんでした。時間を置いて再度お試しください。";
        setConnectError({ provider, message });
      }
      return;
    }
    connectMutation.mutate(provider, {
      onError: (err) => {
        const message =
          err instanceof Error && err.message
            ? err.message
            : `${provider} への接続に失敗しました。`;
        setConnectError({ provider, message });
      },
    });
  }, [orgId, connectMutation]);

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

  // MF Cloud のトークン期限・最終更新を取得（接続済みの場合のみ）。
  // factory-hybrid-v2 と同仕様で IntegrationCard 内に表示する。
  const mfTokenStatusQuery = useQuery({
    queryKey: ["mf-token-status", orgId],
    queryFn: () => api.mfOAuth.getStatus(orgId),
    enabled: !!orgId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // 「トークン更新」ボタン用 mutation。失敗時は connectError バナーで通知。
  const refreshTokenMutation = useMutation({
    mutationFn: () => api.mfOAuth.refresh(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mf-token-status", orgId] });
      queryClient.invalidateQueries({ queryKey: ["integrations", orgId] });
      setConnectError(null);
    },
    onError: (err) => {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "MF Cloud のトークン更新に失敗しました。再接続が必要かもしれません。";
      setConnectError({ provider: "MF_CLOUD", message });
    },
  });

  const toggleNotification = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n))
    );
  };

  return (
    <DashboardShell>
      <div className="space-y-4">
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
                <div><div className="text-xs text-muted-foreground">会社名</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.name || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">事業年度開始</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.accounting_periods?.[0]?.start_date ? mfOffice.data.accounting_periods[0].start_date : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">区分</div><div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{mfOffice.data.type || "—"}</div></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">MFクラウド会計を接続すると会社情報が表示されます</p>
            )}
          </CardContent>
        </Card>

        <CostAccountingCard orgId={orgId} />

        <BriefingPushCard orgId={orgId} />

        <CashflowCertaintyCard orgId={orgId} />

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
            {!orgId && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                顧問先が選択されていません。ヘッダーの「顧問先一覧」から接続したい顧問先を開いてください。
              </div>
            )}
            {displayError && (
              <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{displayError.message}</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={dismissError}
                >
                  閉じる
                </button>
              </div>
            )}
            <div className="space-y-3">
              {ALL_PROVIDERS.map((provider) => {
                const isMfCloud = provider === "MF_CLOUD";
                const mfTokenStatus =
                  isMfCloud && mfTokenStatusQuery.data?.connected
                    ? {
                        expiresAt: mfTokenStatusQuery.data.expiresAt ?? null,
                        lastRefreshedAt:
                          mfTokenStatusQuery.data.lastRefreshedAt ?? null,
                      }
                    : undefined;
                return (
                  <IntegrationCard
                    key={provider}
                    provider={provider}
                    status={statusMap.get(provider)}
                    mfStatus={mfTokenStatus}
                    onConnect={() => handleConnect(provider)}
                    onDisconnect={() => disconnectMutation.mutate(provider)}
                    onSync={() => syncMutation.mutate(provider)}
                    onRefreshToken={
                      isMfCloud
                        ? () => refreshTokenMutation.mutate()
                        : undefined
                    }
                    isSyncing={syncingProviders.has(provider)}
                    isConnecting={connectingProviders.has(provider)}
                    isDisconnecting={disconnectingProviders.has(provider)}
                    isRefreshingToken={
                      isMfCloud && refreshTokenMutation.isPending
                    }
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        <MenuVisibilitySettings />
      </div>
    </DashboardShell>
  );
}

/**
 * 顧問先の「原価計算を運用しているか」トグル。
 *
 * 中小企業では原価計算を実運用していないことが多く、その場合 売上総利益率
 * （grossProfitMargin）は実態を反映しないため、UI / AI レポートで参照を控える。
 * 既定 OFF（= 原価計算なし）。owner / advisor が ON に切替えると、指標ページの
 * 売上総利益率カードと AI コメントが grossProfitMargin を含めて分析するようになる。
 */
function CostAccountingCard({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const orgQuery = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => api.getOrganization(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (next: boolean) =>
      api.updateOrganization(orgId, { usesCostAccounting: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      // AI レポート系もキャッシュ破棄して再生成（原価計算前提が変わるため）
      queryClient.invalidateQueries({ queryKey: ["ai"] });
      queryClient.invalidateQueries({
        queryKey: ["mf", "financial-indicators"],
      });
    },
  });

  if (!orgId) return null;

  const enabled = orgQuery.data?.usesCostAccounting ?? false;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Gauge className="h-4 w-4" />
          分析設定
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orgQuery.isLoading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : (
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div className="pr-4">
              <div className="text-sm text-[var(--color-text-primary)]">
                原価計算を運用している
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                ON にすると財務指標 / AI レポートで「売上総利益率」を分析対象に含めます。
                原価計算を実運用していない場合は OFF のままにしてください
                （売上総利益率は信頼できないため非表示・AI も言及しません）。
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate(!enabled)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                enabled ? "bg-[var(--color-primary)]" : "bg-gray-200",
                updateMutation.isPending && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
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

  const [webhookUrl, setWebhookUrl] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

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

  // 楽観的UI: mutation中はvariablesを優先表示、それ以外はサーバー値
  const pendingVars = saveMutation.isPending ? saveMutation.variables : undefined;
  const enabled = pendingVars?.enabled ?? data?.enabled ?? false;
  const hour = pendingVars?.hourJst ?? data?.hourJst ?? 8;

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
                  saveMutation.mutate({ enabled: !enabled });
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
                  saveMutation.mutate({ hourJst: Number(e.target.value) });
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

function CashflowCertaintyCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["cashflow-certainty", orgId],
    queryFn: () => api.cashflowCertainty.get(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  if (!orgId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <Gauge className="h-4 w-4" />
          資金繰り確度設定
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          勘定科目ごとに確度（確定/予定/概算）を設定します。資金繰り表のセル透明度に反映されます。
        </p>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded bg-muted" />
        ) : (
          <CashflowCertaintyEditor
            orgId={orgId}
            initialRules={data?.rules ?? {}}
          />
        )}
      </CardContent>
    </Card>
  );
}

function buildInitialRows(
  rules: Record<string, CertaintyLevel>,
): { key: string; level: CertaintyLevel }[] {
  const effective = { ...DEFAULT_CERTAINTY_RULES, ...rules };
  return Object.entries(effective).map(([key, level]) => ({
    key,
    level: level as CertaintyLevel,
  }));
}

function CashflowCertaintyEditor({
  orgId,
  initialRules,
}: {
  orgId: string;
  initialRules: Record<string, CertaintyLevel>;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(() => buildInitialRows(initialRules));
  const [newKey, setNewKey] = useState("");
  const [newLevel, setNewLevel] = useState<CertaintyLevel>("PLANNED");

  const saveMutation = useMutation({
    mutationFn: (rules: Record<string, CertaintyLevel>) =>
      api.cashflowCertainty.update(orgId, rules),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cashflow-certainty", orgId],
      });
    },
  });

  const updateRow = (
    index: number,
    patch: Partial<{ key: string; level: CertaintyLevel }>,
  ) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const key = newKey.trim();
    if (!key) return;
    if (rows.some((r) => r.key === key)) return;
    setRows((prev) => [...prev, { key, level: newLevel }]);
    setNewKey("");
  };

  const handleSave = () => {
    const rules: Record<string, CertaintyLevel> = {};
    for (const { key, level } of rows) {
      const trimmed = key.trim();
      if (trimmed) rules[trimmed] = level;
    }
    saveMutation.mutate(rules);
  };

  const handleReset = () => {
    setRows(
      Object.entries(DEFAULT_CERTAINTY_RULES).map(([key, level]) => ({
        key,
        level: level as CertaintyLevel,
      })),
    );
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div
          key={`${row.key}-${i}`}
          className="flex items-center gap-2 rounded-md border px-3 py-2"
        >
          <Input
            value={row.key}
            onChange={(e) => updateRow(i, { key: e.target.value })}
            className="flex-1"
            placeholder="勘定科目名"
          />
          <select
            value={row.level}
            onChange={(e) =>
              updateRow(i, { level: e.target.value as CertaintyLevel })
            }
            className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
          >
            {CERTAINTY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {CERTAINTY_LABEL[level]}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeRow(i)}
            aria-label="削除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="flex-1"
          placeholder="追加する勘定科目名"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRow();
            }
          }}
        />
        <select
          value={newLevel}
          onChange={(e) => setNewLevel(e.target.value as CertaintyLevel)}
          className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
        >
          {CERTAINTY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {CERTAINTY_LABEL[level]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={addRow}
          disabled={!newKey.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="ml-1">追加</span>
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={saveMutation.isPending}
        >
          デフォルトに戻す
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          <span className="ml-1">保存</span>
        </Button>
      </div>
      {saveMutation.isError && (
        <p className="text-xs text-red-600">
          保存に失敗しました: {String(saveMutation.error)}
        </p>
      )}
      {saveMutation.isSuccess && !saveMutation.isPending && (
        <p className="text-xs text-[var(--color-success)]">保存しました</p>
      )}
    </div>
  );
}

function MenuVisibilitySettings() {
  const { isHidden, toggle } = useSidebarConfig();

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
