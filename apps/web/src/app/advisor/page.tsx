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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// ─── Mock Data ───────────────────────────────────────────

const INDUSTRIES = [
  "SaaS",
  "製造業",
  "情報通信業",
  "小売業",
  "コンサルティング",
];

const mockOrgs: OrgListItem[] = Array.from({ length: 50 }, (_, i) => ({
  id: `org-${i + 1}`,
  name: `${["株式会社", "合同会社", "有限会社"][i % 3]}${
    ["テスト", "サンプル", "デモ"][i % 3]
  }${i + 1}`,
  code: `${String(Math.floor(i / 10) + 1).padStart(4, "0")}-${String(
    (i % 10) + 1
  ).padStart(4, "0")}`,
  industry: INDUSTRIES[i % 5],
  fiscalMonthEnd: [3, 6, 9, 12][i % 4],
  planType: ["STARTER", "GROWTH", "PRO"][i % 3],
  employeeCount: 10 + i * 3,
  updatedAt: new Date(2026, 3, 5 - (i % 10)).toISOString(),
}));

function mockPaginate(
  params: {
    page: number;
    limit: number;
    search?: string;
    industry?: string;
    sortBy?: string;
    order?: string;
  }
): PaginatedOrgs {
  let filtered = [...mockOrgs];

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.code && o.code.toLowerCase().includes(q))
    );
  }
  if (params.industry) {
    filtered = filtered.filter((o) => o.industry === params.industry);
  }

  const sortBy = params.sortBy || "name";
  const order = params.order === "desc" ? -1 : 1;
  filtered.sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortBy] ?? "";
    const bv = (b as unknown as Record<string, unknown>)[sortBy] ?? "";
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * order;
    }
    return ((av as number) - (bv as number)) * order;
  });

  const start = (params.page - 1) * params.limit;
  const data = filtered.slice(start, start + params.limit);
  return {
    data,
    total: filtered.length,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(filtered.length / params.limit),
  };
}

const mockSummary: SummaryData = {
  totalOrgs: 50,
  activeOrgs: 42,
  alertCount: 3,
  pendingComments: 8,
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
  const router = useRouter();
  const { switchOrg } = useAuthStore();

  // Data state
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [orgResult, setOrgResult] = useState<PaginatedOrgs | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<OrgListItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

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
        setSummary(mockSummary);
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
        setRecentOrgs(mockOrgs.slice(0, 5));
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
    } catch {
      setOrgResult(
        mockPaginate({
          page,
          limit,
          search: debouncedSearch || undefined,
          industry: industry || undefined,
          sortBy,
          order,
        })
      );
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

  // Favorite orgs from current data
  const favoriteOrgs = useMemo(() => {
    if (!orgResult) return [];
    // Collect from all loaded data -- but we only have current page
    // Use mockOrgs as fallback for favorites lookup
    const allKnown = orgResult.data;
    return favorites
      .map((id) => allKnown.find((o) => o.id === id))
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
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">管理ポータル</h1>
        <p className="text-sm text-muted-foreground">
          担当顧問先の一覧と横断管理
        </p>
      </div>

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
