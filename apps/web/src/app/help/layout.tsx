import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { helpUpdated } from "./_content";
import "./help.css";

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="help-surface min-h-screen bg-[var(--color-background)] text-foreground">
      <a
        href="#help-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        本文へスキップ
      </a>
      <header className="help-header border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:gap-4 sm:px-8">
          <Link href="/help" className="flex items-center gap-3">
            <span className="shrink-0 whitespace-nowrap text-xl font-bold tracking-tight text-[var(--color-primary)]">
              SevenBoard
            </span>
            <span className="hidden h-5 border-l sm:block" />
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">ヘルプ</span>
            </span>
          </Link>
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted sm:text-sm"
          >
            アプリを開く
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main
        id="help-main"
        className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10"
      >
        {children}
      </main>
      <footer className="mx-auto max-w-7xl border-t px-5 py-6 text-xs leading-relaxed text-muted-foreground sm:px-8">
        <p>
          掲載画面：青空ライフ用品卸株式会社（デモ） · 架空の卸売会社 ·
          実績は2026年8月31日まで
        </p>
        <p className="mt-1">
          更新：{helpUpdated}
          。画像は撮影時点の表示です。共通デモでの入力・保存により、現在の画面と数値が異なる場合があります。
        </p>
      </footer>
    </div>
  );
}
