"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Database } from "lucide-react";

type TabKey = "accounts" | "departments" | "users";

const accounts = [
  { code: "4100", name: "売上高", category: "収益", variable: false, order: 100 },
  { code: "5100", name: "売上原価", category: "原価", variable: true, order: 200 },
  { code: "6100", name: "人件費", category: "販管費", variable: true, order: 300 },
  { code: "6200", name: "地代家賃", category: "販管費", variable: false, order: 400 },
];

const departments = [
  { name: "営業部", type: "division", order: 100 },
  { name: "管理部", type: "division", order: 200 },
  { name: "開発チーム", type: "team", order: 300 },
];

const users = [
  { name: "田中 太郎", email: "admin@demo.com", role: "ADMIN" },
  { name: "七海 太郎", email: "advisor@sevenrich.jp", role: "ADVISOR" },
];

export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("accounts");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "accounts", label: "勘定科目" },
    { key: "departments", label: "部門" },
    { key: "users", label: "ユーザー" },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[var(--color-text-primary)]" />
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
              マスタ管理
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            勘定科目・部門・ユーザーの基本設定
          </p>
        </div>

        <div className="flex overflow-hidden rounded-md border border-input">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-9 rounded-none text-xs",
                activeTab === tab.key && "bg-[var(--color-primary)] text-white"
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {activeTab === "accounts" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                勘定科目一覧
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[var(--color-background)]">
                  <TableRow className="border-b-2 border-[var(--color-border)]">
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">コード</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">科目名</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">カテゴリ</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">変動費</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">表示順</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.code}>
                      <TableCell>{account.code}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell><Badge variant="secondary">{account.category}</Badge></TableCell>
                      <TableCell>{account.variable ? "Yes" : "No"}</TableCell>
                      <TableCell>{account.order}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "departments" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                部門一覧
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[var(--color-background)]">
                  <TableRow className="border-b-2 border-[var(--color-border)]">
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">部門名</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">タイプ</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">表示順</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((department) => (
                    <TableRow key={department.name}>
                      <TableCell>{department.name}</TableCell>
                      <TableCell>{department.type}</TableCell>
                      <TableCell>{department.order}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "users" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-[var(--color-text-primary)]">
                ユーザー一覧
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[var(--color-background)]">
                  <TableRow className="border-b-2 border-[var(--color-border)]">
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">氏名</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">メールアドレス</TableHead>
                    <TableHead className="text-[var(--color-text-primary)] font-semibold">役割</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
