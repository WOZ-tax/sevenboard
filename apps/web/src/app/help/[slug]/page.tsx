import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { helpArticles, helpUpdated } from "../_content";
import { ArticleActions, HelpChecks, HelpScreenshot } from "../_components";

export const dynamicParams = false;

export function generateStaticParams() {
  return helpArticles.map((article) => ({ slug: article.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = helpArticles.find((a) => a.slug === slug);
  return {
    title: `${article?.title ?? "ヘルプ"} | SevenBoard`,
    description: article?.summary,
  };
}
export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = helpArticles.find((a) => a.slug === slug);
  if (!article) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <nav
        className="help-no-print mb-6 flex items-center gap-2 text-xs text-muted-foreground"
        aria-label="パンくず"
      >
        <Link
          href="/help"
          className="inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft className="h-3 w-3" />
          ヘルプ
        </Link>
        <span>/</span>
        <span>{article.group}</span>
      </nav>
      <article>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-[var(--color-primary)]/5 px-3 py-1 font-medium text-[var(--color-primary)]">
            {article.group}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />約{article.minutes}分
          </span>
          <span>更新：{helpUpdated}</span>
        </div>
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
          {article.title}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
          {article.summary}
        </p>
        <ArticleActions route={article.route} />
        <nav
          className="help-no-print flex flex-wrap gap-4 border-y py-3 text-xs"
          aria-label="ページ内目次"
        >
          <a
            href="#steps"
            className="text-[var(--color-primary)] hover:underline"
          >
            操作手順
          </a>
          {article.table && (
            <a
              href="#reading"
              className="text-[var(--color-primary)] hover:underline"
            >
              表示の読み方
            </a>
          )}
          <a
            href="#checklist"
            className="text-[var(--color-primary)] hover:underline"
          >
            確認リスト
          </a>
          <a
            href="#related"
            className="text-[var(--color-primary)] hover:underline"
          >
            関連ガイド
          </a>
        </nav>
        {article.images[0] && <HelpScreenshot {...article.images[0]} />}
        {article.note && (
          <aside className="my-6 rounded-lg border border-amber-200 bg-amber-50/70 p-5">
            <h2 className="text-sm font-semibold text-amber-950">
              {article.note.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-amber-950/85">
              {article.note.body}
            </p>
          </aside>
        )}
        <section id="steps" className="scroll-mt-6 py-4">
          <h2 className="mb-6 text-xl font-bold">操作手順</h2>
          <ol className="space-y-6">
            {article.steps.map((step, i) => (
              <li key={step.title} className="help-step flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-sm font-semibold text-[var(--color-primary)]">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <h3 className="font-semibold leading-6">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        {article.table && (
          <section id="reading" className="my-8">
            <h2 className="mb-4 text-xl font-bold">表示の読み方</h2>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {article.table.headers.map((header) => (
                      <th key={header} className="p-4 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {article.table.rows.map((row) => (
                    <tr className="border-t" key={row[0]}>
                      {row.map((cell, i) => (
                        <td
                          key={i}
                          className={`p-4 leading-7 ${i === 0 ? "min-w-36 font-medium" : "text-muted-foreground"}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {article.images.slice(1).map((img) => (
          <HelpScreenshot key={img.file} {...img} />
        ))}
        {article.practice && (
          <section className="my-6 rounded-lg border bg-white p-5">
            <h2 className="font-semibold">デモでやってみる</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {article.practice}
            </p>
          </section>
        )}
        {article.source && (
          <p className="my-5 text-xs text-muted-foreground">
            制度の確認：
            <a
              href={article.source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] underline"
            >
              {article.source.label}
            </a>
          </p>
        )}
        <HelpChecks key={article.slug} article={article} />
      </article>
      <section id="related" className="help-no-print mt-10">
        <h2 className="mb-4 text-lg font-bold">次に読むガイド</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {article.related
            .map((id) => helpArticles.find((a) => a.slug === id))
            .filter((a) => !!a)
            .map((a) => (
              <Link
                key={a.slug}
                href={`/help/${a.slug}`}
                className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4 text-sm font-medium hover:border-[var(--color-primary)]"
              >
                {a.title}
                <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              </Link>
            ))}
        </div>
        <Link
          href="/help"
          className="mt-6 inline-block text-sm text-[var(--color-primary)] hover:underline"
        >
          すべてのガイドを見る
        </Link>
      </section>
    </div>
  );
}
