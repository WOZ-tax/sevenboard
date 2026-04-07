"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  ArrowUpDown,
  Building2,
  Clock3,
  Pin,
  PinOff,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface OrgItem {
  id: string;
  name: string;
  code: string;
  industry: string;
  fiscalMonthEnd: number;
}

type SortKey = "recent" | "name" | "code";

const PINNED_KEY = "sevenboard:pinned-orgs";
const RECENT_KEY = "sevenboard:recent-orgs";
const PAGE_SIZE = 50;

const DEMO_ORGS: OrgItem[] = [
  {
    id: "demo-001",
    name: "デモ経営管理株式会社",
    code: "DEMO-001",
    industry: "IT・SaaS",
    fiscalMonthEnd: 3,
  },
  {
    id: "demo-002",
    name: "サンプル物流サービス株式会社",
    code: "DEMO-002",
    industry: "物流",
    fiscalMonthEnd: 12,
  },
];

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids));
}

function sortOrganizations(
  orgs: OrgItem[],
  sortKey: SortKey,
  recentIds: string[],
  pinnedIds: string[],
) {
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));

  return [...orgs].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id) ? 0 : 1;
    const bPinned = pinnedIds.includes(b.id) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;

    if (sortKey === "recent") {
      const aRecent = recentRank.has(a.id)
        ? recentRank.get(a.id)!
        : Number.MAX_SAFE_INTEGER;
      const bRecent = recentRank.has(b.id)
        ? recentRank.get(b.id)!
        : Number.MAX_SAFE_INTEGER;
      if (aRecent !== bRecent) return aRecent - bRecent;
    }

    if (sortKey === "code") {
      return a.code.localeCompare(b.code, "ja");
    }

    return a.name.localeCompare(b.name, "ja");
  });
}

export default function SelectOrgPage() {
  const router = useRouter();
  const { isAuthenticated, user, switchOrg, hydrate } = useAuthStore();
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const canSwitchOrg = user?.role === "ADVISOR";

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    setPinnedIds(readStoredIds(PINNED_KEY));
    setRecentIds(readStoredIds(RECENT_KEY));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;

    async function fetchOrgs() {
      try {
        const data = await api.getAdvisorOrgs();
        setOrgs(data);
      } catch {
        setOrgs(DEMO_ORGS);
      } finally {
        setLoading(false);
      }
    }

    fetchOrgs();
  }, [hydrated, isAuthenticated]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, sortKey]);

  const filteredOrgs = useMemo(() => {
    if (!deferredQuery) return orgs;

    return orgs.filter((org) =>
      [org.name, org.code, org.industry]
        .join(" ")
        .toLowerCase()
        .includes(deferredQuery),
    );
  }, [orgs, deferredQuery]);

  const sortedOrgs = useMemo(
    () => sortOrganizations(filteredOrgs, sortKey, recentIds, pinnedIds),
    [filteredOrgs, sortKey, recentIds, pinnedIds],
  );

  const pinnedOrgs = useMemo(
    () => sortedOrgs.filter((org) => pinnedIds.includes(org.id)).slice(0, 10),
    [sortedOrgs, pinnedIds],
  );

  const recentOrgs = useMemo(() => {
    const recentRank = new Map(recentIds.map((id, index) => [id, index]));
    return [...orgs]
      .filter((org) => recentRank.has(org.id))
      .sort((a, b) => recentRank.get(a.id)! - recentRank.get(b.id)!)
      .slice(0, 10);
  }, [orgs, recentIds]);

  const totalPages = Math.max(1, Math.ceil(sortedOrgs.length / PAGE_SIZE));
  const pagedOrgs = useMemo(
    () => sortedOrgs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedOrgs, page],
  );

  const handleTogglePin = (orgId: string) => {
    startTransition(() => {
      setPinnedIds((prev) => {
        const next = prev.includes(orgId)
          ? prev.filter((id) => id !== orgId)
          : [orgId, ...prev].slice(0, 20);
        writeStoredIds(PINNED_KEY, next);
        return next;
      });
    });
  };

  const rememberRecent = (orgId: string) => {
    const next = [orgId, ...recentIds.filter((id) => id !== orgId)].slice(0, 20);
    setRecentIds(next);
    writeStoredIds(RECENT_KEY, next);
  };

  const handleSelect = async (org: OrgItem) => {
    if (!canSwitchOrg || switching) return;

    setSelectedId(org.id);
    setSwitching(true);

    try {
      const result = await api.switchOrg(org.id);
      rememberRecent(org.id);
      switchOrg(result.accessToken, result.user);
      router.push("/");
    } catch {
      setSwitching(false);
      setSelectedId(null);
      alert("組織の切替に失敗しました。時間を置いて再度お試しください。");
    }
  };

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-navy-dark)]">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--color-gold)]">
            SevenBoard
          </div>
          <p className="mt-2 text-sm text-gray-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-navy-dark)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-10">
        <Card className="w-full border-white/10 shadow-2xl">
          <CardHeader className="border-b bg-white/80 backdrop-blur">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[var(--color-navy)]">
                    <ArrowRightLeft className="h-5 w-5 text-[var(--color-gold)]" />
                    <span className="text-sm font-medium">マルチテナント切替</span>
                  </div>
                  <CardTitle className="text-2xl text-[var(--color-navy)]">
                    顧問先を選択
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    件数が多い前提で、検索、ピン留め、最近使った顧問先から素早く切り替えられる一覧です。
                  </p>
                  {!canSwitchOrg && (
                    <div className="pt-1">
                      <Badge variant="secondary">プレビュー表示: 現在の権限では切替できません</Badge>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-white px-4 py-3">
                    <div className="text-xs text-muted-foreground">対象組織数</div>
                    <div className="text-lg font-semibold text-[var(--color-navy)]">
                      {orgs.length}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white px-4 py-3">
                    <div className="text-xs text-muted-foreground">ピン留め</div>
                    <div className="text-lg font-semibold text-[var(--color-navy)]">
                      {pinnedIds.length}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white px-4 py-3">
                    <div className="text-xs text-muted-foreground">検索結果</div>
                    <div className="text-lg font-semibold text-[var(--color-navy)]">
                      {filteredOrgs.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="会社名、コード、業種で検索"
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-md border bg-white px-3">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as SortKey)}
                    className="h-10 w-full bg-transparent text-sm outline-none"
                  >
                    <option value="recent">最近使った順</option>
                    <option value="name">会社名順</option>
                    <option value="code">コード順</option>
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 p-6">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">
                組織一覧を読み込み中...
              </div>
            ) : (
              <>
                {(pinnedOrgs.length > 0 || recentOrgs.length > 0) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-xl border bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-navy)]">
                        <Pin className="h-4 w-4 text-[var(--color-gold)]" />
                        ピン留め
                      </div>
                      {pinnedOrgs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          よく使う顧問先をピン留めするとここに表示されます。
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {pinnedOrgs.map((org) => (
                            <QuickOrgRow
                              key={org.id}
                              org={org}
                              active={selectedId === org.id}
                              onSelect={handleSelect}
                              onTogglePin={handleTogglePin}
                              pinned
                              switching={switching}
                              canSwitchOrg={canSwitchOrg}
                            />
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border bg-slate-50/80 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-navy)]">
                        <Clock3 className="h-4 w-4 text-[var(--color-gold)]" />
                        最近使った顧問先
                      </div>
                      {recentOrgs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          まだ切替履歴がありません。
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {recentOrgs.map((org) => (
                            <QuickOrgRow
                              key={org.id}
                              org={org}
                              active={selectedId === org.id}
                              onSelect={handleSelect}
                              onTogglePin={handleTogglePin}
                              pinned={pinnedIds.includes(org.id)}
                              switching={switching}
                              canSwitchOrg={canSwitchOrg}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {filteredOrgs.length === 0 ? (
                  <div className="py-16 text-center">
                    <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      条件に一致する顧問先がありません。
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border">
                    <div className="max-h-[58vh] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-white">
                          <TableRow>
                            <TableHead className="w-[34%]">会社名</TableHead>
                            <TableHead className="w-[14%]">コード</TableHead>
                            <TableHead className="w-[16%]">業種</TableHead>
                            <TableHead className="w-[10%]">決算月</TableHead>
                            <TableHead className="w-[10%] text-center">状態</TableHead>
                            <TableHead className="w-[16%] text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedOrgs.map((org) => {
                            const isActive = selectedId === org.id;
                            const isPinned = pinnedIds.includes(org.id);

                            return (
                              <TableRow
                                key={org.id}
                                className={cn(
                                  "transition-colors",
                                  isActive && "bg-[var(--color-gold)]/10",
                                )}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={cn(
                                        "flex h-9 w-9 items-center justify-center rounded-lg",
                                        isActive
                                          ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                                          : "bg-[var(--color-navy)] text-white",
                                      )}
                                    >
                                      <Building2 className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-[var(--color-navy)]">
                                        {org.name}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="font-[family-name:var(--font-inter)] text-sm text-muted-foreground">
                                  {org.code}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {org.industry}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {org.fiscalMonthEnd}月
                                </TableCell>
                                <TableCell className="text-center">
                                  {isPinned ? (
                                    <Badge variant="secondary">Pinned</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleTogglePin(org.id)}
                                      disabled={switching}
                                    >
                                      {isPinned ? (
                                        <PinOff className="h-3.5 w-3.5" />
                                      ) : (
                                        <Pin className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleSelect(org)}
                                      disabled={!canSwitchOrg || switching}
                                      className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-light)]"
                                    >
                                      {!canSwitchOrg
                                        ? "プレビュー"
                                        : isActive && switching
                                          ? "切替中..."
                                          : "切り替える"}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {sortedOrgs.length} 件中 {(page - 1) * PAGE_SIZE + 1}-
                        {Math.min(page * PAGE_SIZE, sortedOrgs.length)} 件を表示
                      </span>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page <= 1}
                          onClick={() => setPage((prev) => prev - 1)}
                        >
                          前へ
                        </Button>
                        <span>
                          {page} / {totalPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page >= totalPages}
                          onClick={() => setPage((prev) => prev + 1)}
                        >
                          次へ
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {switching && (
                  <div className="text-center text-sm text-muted-foreground">
                    選択した顧問先へ切り替え中...
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickOrgRow({
  org,
  active,
  pinned,
  switching,
  onSelect,
  onTogglePin,
  canSwitchOrg,
}: {
  org: OrgItem;
  active: boolean;
  pinned: boolean;
  switching: boolean;
  onSelect: (org: OrgItem) => void;
  onTogglePin: (orgId: string) => void;
  canSwitchOrg: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-white px-3 py-2",
        active && "border-[var(--color-gold)] bg-[var(--color-gold)]/5",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--color-navy)]">
          {org.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {org.code} · {org.industry}
        </div>
      </div>
      <div className="ml-3 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onTogglePin(org.id)}>
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          onClick={() => onSelect(org)}
          disabled={!canSwitchOrg || switching}
          className="bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy-light)]"
        >
          {!canSwitchOrg ? "プレビュー" : active && switching ? "切替中..." : "選択"}
        </Button>
      </div>
    </div>
  );
}
