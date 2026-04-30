"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Activity,
  AlertTriangle,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  Star,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ExternalLink,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Users,
  X,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { api, type OrgAdvisor, type TenantStaffRow } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useCurrentOrg } from "@/contexts/current-org";
import { useIsClient } from "@/hooks/use-is-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface OrgListItem {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  fiscalMonthEnd: number;
  planType: string;
  employeeCount: number | null;
  updatedAt: string;
}

interface PaginatedOrgs {
  data: OrgListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SummaryData {
  totalOrgs: number;
  activeOrgs: number;
  alertCount: number;
  pendingComments: number;
}

const INDUSTRIES = [
  "SaaS",
  "製造業",
  "情報通信業",
  "小売業",
  "コンサルティング",
];

const emptyOrgs: PaginatedOrgs = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 0,
};

const emptySummary: SummaryData = {
  totalOrgs: 0,
  activeOrgs: 0,
  alertCount: 0,
  pendingComments: 0,
};

// ─── Helpers ─────────────────────────────────────────────

const PLAN_STYLES: Record<string, string> = {
  STARTER: "bg-gray-100 text-gray-700",
  GROWTH: "bg-blue-100 text-blue-700",
  PRO: "bg-amber-100 text-amber-700",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Favorites (localStorage) ────────────────────────────

const FAVORITES_KEY = "sb_favorites";

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

// ─── Component ───────────────────────────────────────────

export default function AdvisorPortalPage() {
  return (
    <DashboardShell>
      <AdvisorPortalContent />
    </DashboardShell>
  );
}

function AdvisorPortalContent() {
  const router = useRouter();
  const switchOrg = useAuthStore((s) => s.switchOrg);
  const user = useAuthStore((s) => s.user);
  const { currentOrg, setCurrentOrgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const hydrated = useIsClient();

  // 事務所スタッフ以外はダッシュボードへ戻す（CL 側からの直接アクセスを防止）
  const canAccess = user?.role === "owner" || user?.role === "advisor";
  useEffect(() => {
    if (hydrated && user && !canAccess) {
      router.push("/");
    }
  }, [hydrated, user, canAccess, router]);

  const canCreateOrg = canAccess;
  const canEditOrg = canAccess;
  const canDeleteOrg = user?.role === "owner";
  const canManageStaff = currentOrg?.tenantRole === "firm_owner";

  // 新規顧問先追加 modal
  const [newOrgOpen, setNewOrgOpen] = useState(false);
  // 編集 / 削除 ターゲット（null なら閉じてる）
  const [editTarget, setEditTarget] = useState<OrgListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgListItem | null>(null);
  const [membersTarget, setMembersTarget] = useState<OrgListItem | null>(null);

  // Data state
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [orgResult, setOrgResult] = useState<PaginatedOrgs | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<OrgListItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Collapse state
  const [showQuickAccess, setShowQuickAccess] = useState(true);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Load favorites from localStorage
  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  // Fetch summary
  useEffect(() => {
    async function fetch() {
      try {
        const data = await api.advisor.getSummary();
        setSummary(data);
      } catch {
        setSummary(emptySummary);
        setFetchFailed(true);
      }
    }
    fetch();
  }, []);

  // Fetch recent orgs
  useEffect(() => {
    async function fetch() {
      try {
        const data = await api.advisor.getRecent();
        setRecentOrgs(data);
      } catch {
        setRecentOrgs([]);
        setFetchFailed(true);
      }
    }
    fetch();
  }, []);

  // Fetch organization list
  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.advisor.listOrgs({
        page,
        limit,
        search: debouncedSearch || undefined,
        industry: industry || undefined,
        sortBy,
        order,
      });
      setOrgResult(data);
      setFetchFailed(false);
    } catch {
      setOrgResult({ ...emptyOrgs, page, limit });
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, industry, sortBy, order]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Switch org handler
  const handleOpenOrg = async (orgId: string) => {
    setSwitching(orgId);
    try {
      const result = await api.switchOrg(orgId);
      switchOrg(result.accessToken, result.user);
      router.push("/");
    } catch {
      setSwitching(null);
      alert("顧問先の切替に失敗しました。再度お試しください。");
    }
  };

  // Toggle favorite
  const handleToggleFavorite = (orgId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(orgId)
        ? prev.filter((id) => id !== orgId)
        : [...prev, orgId].slice(-10);
      saveFavorites(next);
      return next;
    });
  };

  // Sort handler
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
    setPage(1);
  };

  // Industry change
  const handleIndustryChange = (value: string) => {
    setIndustry(value);
    setPage(1);
  };

  // Favorite orgs from current data (we only know orgs on the current page)
  const favoriteOrgs = useMemo(() => {
    if (!orgResult) return [];
    return favorites
      .map((id) => orgResult.data.find((o) => o.id === id))
      .filter(Boolean) as OrgListItem[];
  }, [favorites, orgResult]);

  // Pagination
  const totalPages = orgResult?.totalPages || 1;
  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (
        let i = Math.max(2, page - 1);
        i <= Math.min(totalPages - 1, page + 1);
        i++
      ) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  // Summary cards config
  const summaryCards = [
    {
      label: "担当顧問先",
      value: summary?.totalOrgs ?? "-",
      suffix: "社",
      icon: Building2,
      color: "text-[var(--color-navy)]",
      bg: "bg-blue-50",
    },
    {
      label: "アクティブ",
      value: summary?.activeOrgs ?? "-",
      suffix: "社",
      icon: Activity,
      color: "text-[var(--color-positive)]",
      bg: "bg-green-50",
    },
    {
      label: "要対応アラート",
      value: summary?.alertCount ?? "-",
      suffix: "件",
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "未承認コメント",
      value: summary?.pendingComments ?? "-",
      suffix: "件",
      icon: MessageSquare,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">管理ポータル</h1>
          <p className="text-sm text-muted-foreground">
            担当顧問先の一覧と横断管理
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageStaff && (
            <Button
              variant="outline"
              onClick={() => router.push("/advisor/staff")}
              className="gap-1.5"
            >
              <Building2 className="h-4 w-4" />
              事務所スタッフ管理
            </Button>
          )}
          {canCreateOrg && (
            <Button
              onClick={() => setNewOrgOpen(true)}
              className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
            >
              <Plus className="h-4 w-4" />
              新規顧問先追加
            </Button>
          )}
        </div>
      </div>

      <NewOrgDialog
        open={newOrgOpen}
        onOpenChange={setNewOrgOpen}
        onCreated={(org) => {
          // memberships キャッシュを破棄して再取得 → 次の useCurrentOrg で新 org を選択可能に
          queryClient.invalidateQueries({ queryKey: ["auth", "memberships"] });
          setCurrentOrgId(org.id);
          setNewOrgOpen(false);
          // 一覧を即時更新するため refresh
          fetchOrgs();
          // ダッシュボードへ遷移（オンボーディング初期化はそのページ側で）
          router.push("/");
        }}
      />

      <EditOrgDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["auth", "memberships"] });
          setEditTarget(null);
          fetchOrgs();
        }}
      />

      <DeleteOrgDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["auth", "memberships"] });
          setDeleteTarget(null);
          fetchOrgs();
        }}
      />

      <MembersDialog
        target={membersTarget}
        tenantId={currentOrg?.tenantId ?? null}
        onClose={() => setMembersTarget(null)}
      />

      {fetchFailed && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">
            顧問先一覧を取得できませんでした。ネットワーク状況をご確認のうえ、時間を置いて再読み込みしてください。
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  card.bg
                )}
              >
                <card.icon className={cn("h-5 w-5", card.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-bold">
                  {card.value}
                  <span className="ml-0.5 text-sm font-normal text-muted-foreground">
                    {card.suffix}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick access: Favorites + Recent */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => setShowQuickAccess((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-gray-50"
        >
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            お気に入り・最近アクセス
          </span>
          {showQuickAccess ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {showQuickAccess && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3">
            {/* Favorites */}
            {favoriteOrgs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  お気に入り
                </p>
                <div className="flex flex-wrap gap-2">
                  {favoriteOrgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleOpenOrg(org.id)}
                      disabled={!!switching}
                      className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-gold)] hover:bg-amber-50"
                    >
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {org.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Recent */}
            {recentOrgs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  最近アクセス
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentOrgs.slice(0, 5).map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleOpenOrg(org.id)}
                      disabled={!!switching}
                      className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-400 hover:bg-gray-50"
                    >
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {org.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {favoriteOrgs.length === 0 && recentOrgs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                まだお気に入り・アクセス履歴がありません
              </p>
            )}
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="会社名・コードで検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={industry}
            onChange={(e) => handleIndustryChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">すべての業種</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
          <select
            value={`${sortBy}:${order}`}
            onChange={(e) => {
              const [s, o] = e.target.value.split(":");
              setSortBy(s);
              setOrder(o as "asc" | "desc");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="name:asc">名前順 (A-Z)</option>
            <option value="name:desc">名前順 (Z-A)</option>
            <option value="updatedAt:desc">最終更新 (新しい順)</option>
            <option value="updatedAt:asc">最終更新 (古い順)</option>
            <option value="code:asc">コード順</option>
          </select>
        </div>
      </div>

      {/* Results info */}
      {orgResult && (
        <p className="text-sm text-muted-foreground">
          {orgResult.total}件中 {(page - 1) * limit + 1}〜
          {Math.min(page * limit, orgResult.total)}件を表示
        </p>
      )}

      {/* Organization table (desktop) */}
      <div className="hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <div className="max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-white">
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  会社名
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("code")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  コード
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>業種</TableHead>
              <TableHead>決算月</TableHead>
              <TableHead>従業員数</TableHead>
              <TableHead>プラン</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("updatedAt")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  最終更新
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center">
                  <p className="text-muted-foreground">読み込み中...</p>
                </TableCell>
              </TableRow>
            ) : orgResult && orgResult.data.length > 0 ? (
              orgResult.data.map((org) => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenOrg(org.id)}
                >
                  <TableCell>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(org.id);
                      }}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          favorites.includes(org.id)
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-300 hover:text-amber-400"
                        )}
                      />
                    </button>
                  </TableCell>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {org.code || "-"}
                  </TableCell>
                  <TableCell>
                    {org.industry ? (
                      <Badge variant="outline">{org.industry}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{org.fiscalMonthEnd}月</TableCell>
                  <TableCell>
                    {org.employeeCount != null ? `${org.employeeCount}人` : "-"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        PLAN_STYLES[org.planType] || "bg-gray-100 text-gray-700"
                      )}
                    >
                      {org.planType}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(org.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={switching === org.id}
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenOrg(org.id);
                        }}
                      >
                        {switching === org.id ? (
                          "..."
                        ) : (
                          <>
                            開く
                            <ExternalLink className="h-3 w-3" />
                          </>
                        )}
                      </Button>
                      {canEditOrg && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-muted-foreground hover:text-[var(--color-navy)]"
                          aria-label="担当者"
                          title="担当者"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMembersTarget(org);
                          }}
                        >
                          <Users className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEditOrg && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-muted-foreground hover:text-[var(--color-navy)]"
                          aria-label="編集"
                          title="編集"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTarget(org);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDeleteOrg && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          aria-label="削除"
                          title="削除"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(org);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center">
                  <p className="text-muted-foreground">
                    該当する顧問先が見つかりません
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Organization cards (mobile) */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        ) : orgResult && orgResult.data.length > 0 ? (
          orgResult.data.map((org) => (
            <Card
              key={org.id}
              className="cursor-pointer shadow-sm transition-shadow hover:shadow-md"
              onClick={() => handleOpenOrg(org.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(org.id);
                        }}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            favorites.includes(org.id)
                              ? "fill-amber-400 text-amber-400"
                              : "text-gray-300"
                          )}
                        />
                      </button>
                      <p className="truncate font-medium">{org.name}</p>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {org.code || "-"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      PLAN_STYLES[org.planType] || "bg-gray-100 text-gray-700"
                    )}
                  >
                    {org.planType}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {org.industry && (
                    <Badge variant="outline">{org.industry}</Badge>
                  )}
                  <span>{org.fiscalMonthEnd}月決算</span>
                  {org.employeeCount != null && (
                    <span>{org.employeeCount}人</span>
                  )}
                  <span>{formatDate(org.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              該当する顧問先が見つかりません
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {orgResult && orgResult.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="px-2 text-sm text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="sm"
                onClick={() => setPage(p as number)}
                className={cn(
                  "min-w-[32px]",
                  p === page &&
                    "bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-light)]"
                )}
              >
                {p}
              </Button>
            )
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── New Org Dialog ─────────────────────────────────────

interface NewOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (org: { id: string; name: string }) => void;
}

function NewOrgDialog({ open, onOpenChange, onCreated }: NewOrgDialogProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [managementNo, setManagementNo] = useState("");
  const [fiscalMonthEnd, setFiscalMonthEnd] = useState("3");
  const [industry, setIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // open/close 切替時にフォームをリセット
  useEffect(() => {
    if (!open) {
      setName("");
      setCode("");
      setManagementNo("");
      setFiscalMonthEnd("3");
      setIndustry("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("顧問先名を入力してください");
      return;
    }
    const monthInt = parseInt(fiscalMonthEnd, 10);
    if (!Number.isFinite(monthInt) || monthInt < 1 || monthInt > 12) {
      setError("決算月は 1〜12 で指定してください");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = await api.createOrganization({
        name: trimmedName,
        ...(code.trim() ? { code: code.trim() } : {}),
        ...(managementNo.trim() ? { managementNo: managementNo.trim() } : {}),
        fiscalMonthEnd: monthInt,
        ...(industry.trim() ? { industry: industry.trim() } : {}),
      });
      onCreated({ id: created.id, name: created.name });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "顧問先の作成に失敗しました";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新規顧問先追加</DialogTitle>
            <DialogDescription>
              事務所スタッフ（owner / advisor）が新しい顧問先を登録します。作成者は自動で担当アサインに追加されます。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-org-name">
                顧問先名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="new-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="株式会社○○"
                maxLength={100}
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-org-fiscal">
                  決算月 <span className="text-red-500">*</span>
                </Label>
                <select
                  id="new-org-fiscal"
                  value={fiscalMonthEnd}
                  onChange={(e) => setFiscalMonthEnd(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={String(m)}>
                      {m}月
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-org-industry">業種</Label>
                <Input
                  id="new-org-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="SaaS / 製造業 など"
                  maxLength={40}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-org-code">MF事業者コード</Label>
              <Input
                id="new-org-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MF Cloud と連携する場合に設定"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                未設定でも作成可能。後から設定画面で追加できます。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-org-mno">管理No（社内）</Label>
              <Input
                id="new-org-mno"
                value={managementNo}
                onChange={(e) => setManagementNo(e.target.value)}
                placeholder="社内システム上の管理番号"
                maxLength={40}
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
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  作成中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  作成して切替
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Org Dialog ─────────────────────────────────────

interface EditOrgDialogProps {
  target: OrgListItem | null;
  onClose: () => void;
  onUpdated: () => void;
}

function EditOrgDialog({ target, onClose, onUpdated }: EditOrgDialogProps) {
  const user = useAuthStore((s) => s.user);
  const canEditPlan = user?.role === "owner";
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [fiscalMonthEnd, setFiscalMonthEnd] = useState("3");
  const [industry, setIndustry] = useState("");
  const [planType, setPlanType] = useState<"STARTER" | "GROWTH" | "PRO">(
    "STARTER",
  );
  // 原価計算トグル。OrgListItem には含まれないので、target が変わったら
  // api.getOrganization で詳細を別フェッチして初期化する
  const [usesCostAccounting, setUsesCostAccounting] = useState(false);
  const [originalUsesCostAccounting, setOriginalUsesCostAccounting] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // target が変わるたびにフォームに流し込み
  useEffect(() => {
    if (target) {
      setName(target.name);
      setCode(target.code ?? "");
      setFiscalMonthEnd(String(target.fiscalMonthEnd));
      setIndustry(target.industry ?? "");
      setPlanType(
        (["STARTER", "GROWTH", "PRO"] as const).includes(
          target.planType as "STARTER" | "GROWTH" | "PRO",
        )
          ? (target.planType as "STARTER" | "GROWTH" | "PRO")
          : "STARTER",
      );
      setError(null);
      setSubmitting(false);
      // 原価計算フラグだけ追加 fetch
      api
        .getOrganization(target.id)
        .then((org) => {
          setUsesCostAccounting(org.usesCostAccounting);
          setOriginalUsesCostAccounting(org.usesCostAccounting);
        })
        .catch(() => {
          setUsesCostAccounting(false);
          setOriginalUsesCostAccounting(false);
        });
    }
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("顧問先名を入力してください");
      return;
    }
    const monthInt = parseInt(fiscalMonthEnd, 10);
    if (!Number.isFinite(monthInt) || monthInt < 1 || monthInt > 12) {
      setError("決算月は 1〜12 で指定してください");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.updateOrganization(target.id, {
        name: trimmedName,
        code: code.trim() || undefined,
        fiscalMonthEnd: monthInt,
        industry: industry.trim() || undefined,
        ...(canEditPlan && planType !== target.planType ? { planType } : {}),
        ...(usesCostAccounting !== originalUsesCostAccounting
          ? { usesCostAccounting }
          : {}),
      });
      onUpdated();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "顧問先の更新に失敗しました";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>顧問先を編集</DialogTitle>
            <DialogDescription>
              {target?.name} の基本情報を更新します。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-org-name">
                顧問先名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-fiscal">
                  決算月 <span className="text-red-500">*</span>
                </Label>
                <select
                  id="edit-org-fiscal"
                  value={fiscalMonthEnd}
                  onChange={(e) => setFiscalMonthEnd(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={String(m)}>
                      {m}月
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-org-industry">業種</Label>
                <Input
                  id="edit-org-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  maxLength={40}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-org-code">MF事業者コード</Label>
              <Input
                id="edit-org-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={40}
              />
            </div>

            {canEditPlan && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-plan">契約プラン</Label>
                <select
                  id="edit-org-plan"
                  value={planType}
                  onChange={(e) =>
                    setPlanType(e.target.value as "STARTER" | "GROWTH" | "PRO")
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="STARTER">STARTER（基本）</option>
                  <option value="GROWTH">GROWTH（標準）</option>
                  <option value="PRO">PRO（上位）</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  請求機能は今後追加予定。現状は表示のみ。
                </p>
              </div>
            )}

            {/* 原価計算トグル。OFF（既定）= 売上総利益率を信用しないモード */}
            <div className="flex items-start justify-between rounded-md border px-3 py-2.5">
              <div className="pr-3">
                <div className="text-sm font-medium text-[var(--color-text-primary)]">
                  原価計算を運用している
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ON にすると指標 / AI レポートで売上総利益率を分析対象に含めます。原価計算未運用なら OFF のまま（売上総利益率は非表示）。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={usesCostAccounting}
                onClick={() => setUsesCostAccounting((v) => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
                  usesCostAccounting
                    ? "bg-[var(--color-primary)]"
                    : "bg-gray-200",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                    usesCostAccounting ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
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
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
            >
              {submitting ? (
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

// ─── Delete Org Dialog ───────────────────────────────────

interface DeleteOrgDialogProps {
  target: OrgListItem | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteOrgDialog({ target, onClose, onDeleted }: DeleteOrgDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setConfirmText("");
      setError(null);
      setSubmitting(false);
    }
  }, [target]);

  // DB の name に意図せぬ前後空白が混入していても確認ロジックが破綻しないよう両側 trim
  const matches =
    !!target && confirmText.trim() === (target.name ?? "").trim();

  const handleConfirm = async () => {
    if (!target || !matches || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.deleteOrganization(target.id);
      onDeleted();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "顧問先の削除に失敗しました";
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-700">顧問先を削除</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{target?.name}</span>{" "}
            を完全に削除します。仕訳・予算・コメント等の関連データも併せて消失します。**この操作は取り消せません。**
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            実行前に MF Cloud 連携を解除し、必要な月次データのバックアップを取得してください。
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delete-org-confirm">
              削除を確定するには、顧問先名「
              <span className="font-mono font-semibold">{target?.name}</span>
              」を入力してください
            </Label>
            <Input
              id="delete-org-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={target?.name ?? ""}
              autoComplete="off"
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
            disabled={submitting}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            disabled={!matches || submitting}
            onClick={handleConfirm}
            className="gap-1.5 bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                削除中...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                完全に削除
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Members Dialog (担当アサイン管理) ─────────────────────

interface MembersDialogProps {
  target: OrgListItem | null;
  tenantId: string | null;
  onClose: () => void;
}

function MembersDialog({ target, tenantId, onClose }: MembersDialogProps) {
  const queryClient = useQueryClient();
  const orgId = target?.id ?? null;

  const advisorsQuery = useQuery({
    queryKey: ["org-advisors", orgId],
    queryFn: () => api.organizationAdvisors.list(orgId!),
    enabled: !!orgId,
  });

  const staffQuery = useQuery({
    queryKey: ["tenant-staff", tenantId],
    queryFn: () => api.tenantStaff.list(tenantId!),
    enabled: !!tenantId && !!orgId,
    staleTime: 30_000,
  });

  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- target が null になる close 時のフォーム reset
      setPicking(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- target 変更時のエラー clear
      setError(null);
    }
  }, [target]);

  const advisors = advisorsQuery.data ?? [];
  const allStaff = staffQuery.data ?? [];
  const assignedIds = useMemo(
    () => new Set(advisors.map((a) => a.userId)),
    [advisors],
  );
  const candidates = useMemo(
    () =>
      allStaff.filter(
        (s) => s.status === "active" && !assignedIds.has(s.id),
      ),
    [allStaff, assignedIds],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["org-advisors", orgId] });
  };

  const addMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      api.organizationAdvisors.add(orgId!, userIds),
    onSuccess: () => {
      refresh();
      setPicking(false);
      setError(null);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.organizationAdvisors.remove(orgId!, userId),
    onSuccess: () => {
      refresh();
      setError(null);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    },
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--color-navy)]" />
            担当者を管理
          </DialogTitle>
          <DialogDescription>
            {target?.name} の担当アサイン (advisor 側) を追加・削除します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {advisorsQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border border-gray-200">
              {advisors.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  まだ担当者がアサインされていません
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {advisors.map((a) => (
                    <li
                      key={a.userId}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {a.user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.user.email}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        aria-label="削除"
                        title="アサイン解除"
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(a.userId)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!picking ? (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => setPicking(true)}
              disabled={!tenantId}
            >
              <UserPlus className="h-4 w-4" />
              担当者を追加
            </Button>
          ) : (
            <MemberPicker
              candidates={candidates}
              loading={staffQuery.isLoading}
              submitting={addMutation.isPending}
              onCancel={() => setPicking(false)}
              onSubmit={(userIds) => addMutation.mutate(userIds)}
            />
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MemberPickerProps {
  candidates: TenantStaffRow[];
  loading: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (userIds: string[]) => void;
}

function MemberPicker({
  candidates,
  loading,
  submitting,
  onCancel,
  onSubmit,
}: MemberPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [candidates, filter]);

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="名前・メールで検索"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 flex-1"
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            追加できるスタッフがいません
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((s) => {
              const checked = selected.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50",
                      checked && "bg-blue-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-3.5 w-3.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {s.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.email}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={selected.size === 0 || submitting}
          onClick={() => onSubmit(Array.from(selected))}
          className="gap-1.5 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          {selected.size > 0 ? `${selected.size}名 追加` : "追加"}
        </Button>
      </div>
    </div>
  );
}
