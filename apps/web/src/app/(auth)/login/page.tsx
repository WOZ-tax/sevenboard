"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  password: z
    .string()
    .min(1, "パスワードを入力してください")
    .min(8, "パスワードは8文字以上で入力してください"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const DEMO_USERS = [
  {
    email: "admin@demo.com",
    password: "password123",
    user: {
      id: "demo-admin",
      email: "admin@demo.com",
      name: "田中 太郎",
      role: "ADMIN",
      orgId: "demo-org",
    },
  },
  {
    email: "advisor@sevenrich.jp",
    password: "password123",
    user: {
      id: "demo-advisor",
      email: "advisor@sevenrich.jp",
      name: "七海 太郎",
      role: "ADVISOR",
      orgId: "demo-org",
    },
  },
] as const;

function tryDemoLogin(email: string, password: string) {
  return DEMO_USERS.find(
    (candidate) => candidate.email === email && candidate.password === password
  );
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [apiError, setApiError] = useState<string | null>(null);
  const [usedDemoMode, setUsedDemoMode] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    defaultValues: { email: "admin@demo.com", password: "password123" },
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    setUsedDemoMode(false);

    try {
      const result = await api.login(data.email, data.password);
      login(result.accessToken, result.user);
      if (result.user.role === "ADVISOR") {
        router.push("/advisor");
      } else {
        router.push("/");
      }
      return;
    } catch (err) {
      const demoUser = tryDemoLogin(data.email, data.password);
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error &&
          /fetch|network|failed to fetch|load failed/i.test(err.message));

      if (isNetworkError && demoUser) {
        login("demo-token", demoUser.user);
        setUsedDemoMode(true);
        if (demoUser.user.role === "ADVISOR") {
          router.push("/advisor");
        } else {
          router.push("/");
        }
        return;
      }

      setApiError(
        err instanceof Error
          ? err.message
          : "ログインに失敗しました。もう一度お試しください。"
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[#004d80]">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="pb-2 text-center">
          <div className="mb-2 text-3xl font-bold text-[var(--color-primary)]">
            SevenBoard
          </div>
          <CardTitle className="text-lg font-normal text-muted-foreground">
            経営管理ダッシュボード
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {apiError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-[var(--color-negative)]">{apiError}</p>
              </div>
            )}
            {usedDemoMode && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  API が起動していないため、デモモードでログインしました。
                </p>
              </div>
            )}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              デモ用: `admin@demo.com / password123`
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                {...register("email", {
                  required: "メールアドレスを入力してください",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "有効なメールアドレスを入力してください",
                  },
                })}
              />
              {errors.email && (
                <p className="text-xs text-[var(--color-negative)]">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password", {
                  required: "パスワードを入力してください",
                  minLength: {
                    value: 8,
                    message: "パスワードは8文字以上で入力してください",
                  },
                })}
              />
              {errors.password && (
                <p className="text-xs text-[var(--color-negative)]">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            >
              {isSubmitting ? "ログイン中..." : "ログイン"}
            </Button>
            <div className="text-center">
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-[var(--color-primary)]"
              >
                パスワードを忘れた場合
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
