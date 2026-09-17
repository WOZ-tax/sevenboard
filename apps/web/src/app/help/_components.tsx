"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  Search,
  ZoomIn,
  Printer,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  helpArticles,
  helpGroups,
  type HelpArticle,
  type HelpGroup,
} from "./_content";

export function HelpIndex() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<HelpGroup | "すべて">("すべて");
  const query = search.trim().toLowerCase();
  const articles = helpArticles.filter(
    (article) =>
      (group === "すべて" || article.group === group) &&
      (!query || JSON.stringify(article).toLowerCase().includes(query)),
  );
  return (
    <>
      <section className="grid items-center gap-7 rounded-xl border bg-white p-6 sm:p-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--color-primary)]">
            はじめての SevenBoard
          </p>
          <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-4xl">
            数字を確かめる。
            <br />
            次の支援につなげる。
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            デモの実画面を見ながら、月次レビューから経営・決算支援まで。はじめての操作も、途中で迷ったときも、ここから確認できます。
          </p>
          <Link
            href="/help/quickstart"
            className="mt-6 inline-flex items-center gap-3 rounded-md bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            15分のスタートガイド
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            全{helpArticles.length}ガイド · デモ画面付き ·
            ログイン不要で閲覧できます
          </p>
        </div>
        <Link
          href="/help/quickstart"
          className="group overflow-hidden rounded-lg border shadow-sm"
          aria-label="デモ画面からスタートガイドを開く"
        >
          <Image
            src="/help/dashboard.png"
            alt="架空の卸売会社のダッシュボード。売上・利益・現預金などの概要を表示。"
            width={1440}
            height={1000}
            unoptimized
            loading="eager"
            className="h-auto w-full"
          />
          <span className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-xs">
            青空ライフ用品卸株式会社（デモ）
            <span className="text-[var(--color-primary)]">画面の見方へ →</span>
          </span>
        </Link>
      </section>

      <section
        className="my-8 grid gap-3 sm:grid-cols-3"
        aria-label="目的から探す"
      >
        {[
          {
            href: "monthly-review",
            no: "01",
            title: "月次を確認する",
            text: "帳簿・残高・源泉税をチェック",
          },
          {
            href: "locaben",
            no: "02",
            title: "経営の変化を見る",
            text: "財務指標と過去3期を比較",
          },
          {
            href: "year-end",
            no: "03",
            title: "決算に備える",
            text: "着地利益・納税・資金繰りを確認",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={`/help/${item.href}`}
            className="flex items-center gap-4 rounded-lg border bg-white p-4 transition-colors hover:border-[var(--color-primary)]"
          >
            <span className="text-xl font-semibold text-[var(--color-primary)]/60">
              {item.no}
            </span>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">{item.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{item.text}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </section>

      <section aria-labelledby="help-guides-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="help-guides-heading" className="text-xl font-bold">
              操作ガイド
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              やりたいこと、画面名、困った内容から探せます。
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">ヘルプを検索</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="源泉、ロカベン、担当者…"
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
            />
          </label>
        </div>
        <div
          className="my-5 flex flex-wrap gap-2"
          role="group"
          aria-label="ガイドのカテゴリ"
        >
          {(["すべて", ...helpGroups] as const).map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={group === label}
              onClick={() => setGroup(label)}
              className={`rounded-full border px-4 py-2 text-xs font-medium ${group === label ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "bg-white hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {articles.length}件のガイド
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Link
              href={`/help/${article.slug}`}
              key={article.slug}
              className="group flex flex-col rounded-lg border bg-white p-5 transition-colors hover:border-[var(--color-primary)]"
            >
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{article.group}</span>
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {article.minutes}分
                </span>
              </div>
              <h3 className="font-semibold leading-relaxed group-hover:text-[var(--color-primary)]">
                {article.title}
              </h3>
              <p className="mb-4 mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {article.summary}
              </p>
              <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-primary)]">
                ガイドを読む
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
        {!articles.length && (
          <div className="rounded-lg border bg-white p-8 text-center">
            <p className="text-sm">
              該当するガイドがありません。「保存」など短い言葉でも検索できます。
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSearch("");
                setGroup("すべて");
              }}
            >
              検索条件をクリア
            </Button>
          </div>
        )}
      </section>
      <section className="mt-8 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">研修の進め方</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          スタートガイドを開き、別タブでデモを操作しながら進めてください。各ガイドの最後に確認リストがあります。説明資料にする場合は、ガイドの「印刷
          / PDF保存」を使えます。
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          共通デモへの入力は他の利用者にも反映されます。ログイン情報は管理者から受け取ってください。
        </p>
      </section>
    </>
  );
}

export function HelpScreenshot({
  file,
  caption,
}: {
  file: string;
  caption: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <figure className="help-figure my-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-lg border bg-white text-left shadow-sm"
        aria-label={`${caption} 画像を拡大`}
      >
        <Image
          src={`/help/${file}.png`}
          alt={caption}
          width={1440}
          height={1000}
          unoptimized
          className="h-auto w-full"
        />
        <span className="help-no-print absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md border bg-white/95 px-3 py-2 text-xs font-medium shadow-sm">
          <ZoomIn className="h-4 w-4" />
          拡大して見る
        </span>
      </button>
      <figcaption className="mt-2 text-xs leading-6 text-muted-foreground">
        {caption}
      </figcaption>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[96vw] sm:max-w-[96vw] max-h-[94vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>デモ画面を拡大</DialogTitle>
            <DialogDescription>{caption}</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto">
            <Image
              src={`/help/${file}.png`}
              alt={caption}
              width={1440}
              height={1000}
              unoptimized
              className="h-auto w-[1440px] max-w-none"
            />
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
}

export function ArticleActions({ route }: { route?: string }) {
  return (
    <div className="help-no-print my-5 flex flex-wrap gap-2">
      {route && (
        <Link
          href={route}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          操作画面を開く
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        印刷 / PDF保存
      </Button>
    </div>
  );
}

export function HelpChecks({
  article,
}: {
  article: Pick<HelpArticle, "slug" | "checks">;
}) {
  const [done, setDone] = useState<number[]>([]);
  return (
    <section
      id="checklist"
      className="help-checks mt-8 rounded-lg border bg-white p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">できたことを確認</h2>
        <span
          className="help-no-print text-xs text-muted-foreground"
          role="status"
        >
          {done.length} / {article.checks.length}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {article.checks.map((check, i) => (
          <label
            key={check}
            className="flex cursor-pointer items-start gap-3 text-sm leading-6"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              checked={done.includes(i)}
              onChange={(e) =>
                setDone(
                  e.target.checked ? [...done, i] : done.filter((n) => n !== i),
                )
              }
            />
            {check}
          </label>
        ))}
      </div>
      {done.length === article.checks.length && (
        <p className="help-no-print mt-4 flex items-center gap-2 text-sm font-medium text-green-700">
          <Check className="h-4 w-4" />
          このガイドの確認ができました。
        </p>
      )}
      <p className="help-no-print mt-4 text-xs text-muted-foreground">
        研修用のチェックです。業務データは変更されません。再読み込みするとチェックは戻ります。
      </p>
    </section>
  );
}
