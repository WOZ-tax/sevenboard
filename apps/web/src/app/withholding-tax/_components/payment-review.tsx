"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  type WithholdingTaxReviewResult,
  type WithholdingTaxReviewStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const statuses: Record<
  WithholdingTaxReviewStatus,
  { label: string; description: string; tone: string }
> = {
  CLEARED: {
    label: "残高0・一致",
    description:
      "対象期分の預り金は0円です。源泉集計と補助科目ごとの残高も一致しています。",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  BALANCE_REMAINING: {
    label: "残高あり",
    description:
      "対象期分の預り金が残っています。納付不足・納付仕訳の未計上を確認してください。",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  OVERPAID: {
    label: "過大納付・科目を確認",
    description:
      "借方残高のある源泉科目があります。納付額や補助科目の付け違いを確認してください。",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  REVIEW_REQUIRED: {
    label: "要確認",
    description:
      "自動判定を保留しています。差額と下記の確認項目をご確認ください。",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  NOT_READY: {
    label: "集計期間中",
    description:
      "半期がまだ終了していません。6月末／12月末の残高を確認できる時期にレビューしてください。",
    tone: "border-border bg-muted/30 text-muted-foreground",
  },
  NO_DATA: {
    label: "対象データなし",
    description:
      "照合できる徴収・納付データがありません。納付済みの判定は行っていません。",
    tone: "border-border bg-muted/30 text-muted-foreground",
  },
};

export function WithholdingPaymentReview({
  orgId,
  year,
  initialHalf,
  enabled,
}: {
  orgId: string;
  year: number;
  initialHalf: 1 | 2;
  enabled: boolean;
}) {
  const [half, setHalf] = useState<1 | 2>(initialHalf);
  return (
    <Card data-testid="withholding-payment-review" className="min-w-0">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-[var(--color-primary)]" />
            納付後残高レビュー
          </CardTitle>
          <Badge variant="outline">納期の特例</Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          源泉集計と納付仕訳を照合し、対象の半年分の預り金が0円になるか確認します。納期の特例を適用している顧問先向けです。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="レビューする半期">
          {([1, 2] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={half === value ? "default" : "outline"}
              aria-pressed={half === value}
              onClick={() => setHalf(value)}
              className="h-auto min-h-8 max-w-full whitespace-normal text-left"
            >
              {year}年{" "}
              {value === 1 ? "1〜6月 → 7/10納付" : "7〜12月 → 翌1/20納付"}
            </Button>
          ))}
        </div>
        <PeriodReview
          key={half}
          orgId={orgId}
          year={year}
          half={half}
          enabled={enabled}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          住民税・社会保険は除外し、確認期間に新たに徴収した翌期分の源泉税は分けて表示します。
          給与・退職金・一定の士業報酬が特例の対象です。
          <a
            href="https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm"
            target="_blank"
            rel="noreferrer"
            className="ml-1 underline underline-offset-2"
          >
            国税庁：納期の特例
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function PeriodReview({
  orgId,
  year,
  half,
  enabled,
}: {
  orgId: string;
  year: number;
  half: 1 | 2;
  enabled: boolean;
}) {
  const [checkDate, setCheckDate] = useState(() => {
    const date = new Date(
      `${half === 1 ? `${year}-07-10` : `${year + 1}-01-20`}T00:00:00Z`,
    );
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
      date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [requestedDate, setRequestedDate] = useState<string | null>(null);
  const minDate = half === 1 ? `${year}-07-01` : `${year + 1}-01-01`;
  const maxDate = half === 1 ? `${year}-12-31` : `${year + 1}-06-30`;
  const parsed = new Date(`${checkDate}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(checkDate) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === checkDate &&
    checkDate >= minDate &&
    checkDate <= maxDate;
  const matchesRequest = requestedDate === checkDate;
  const query = useQuery({
    queryKey: ["withholding-tax", "review", orgId, year, half, requestedDate],
    queryFn: () =>
      api.withholdingTax.review(orgId, {
        year,
        half,
        checkDate: requestedDate!,
      }),
    enabled: enabled && requestedDate !== null && matchesRequest && valid,
    // 確認日を戻して実行した場合も、キャッシュだけで完了させず再照合する。
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
          納付確認日
          <input
            type="date"
            value={checkDate}
            min={minDate}
            max={maxDate}
            onChange={(event) => setCheckDate(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!enabled || !valid || query.isFetching}
          onClick={() =>
            matchesRequest ? void query.refetch() : setRequestedDate(checkDate)
          }
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")}
          />
          {query.isFetching ? "照合中…" : "納付後残高を確認"}
        </Button>
        <p className="basis-full text-[11px] text-muted-foreground">
          半期終了後から確認日までの納付を照合します。土日祝・期限延長や納付日のずれがある場合は、確認日を変更してください。
        </p>
        {!valid && (
          <p role="alert" className="text-xs text-destructive">
            確認日は{minDate}〜{maxDate}で指定してください。
          </p>
        )}
      </div>
      <div aria-live="polite" aria-busy={query.isFetching}>
        {!matchesRequest ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            確認日を指定して「納付後残高を確認」を押してください。
          </div>
        ) : query.isFetching ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            半期末の預り金残高と、納付・調整の仕訳を照合しています。
          </div>
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            レビューを取得できませんでした。MF接続を確認して、もう一度お試しください。
          </div>
        ) : query.data ? (
          <ReviewResult data={query.data} />
        ) : null}
      </div>
    </div>
  );
}

function ReviewResult({ data }: { data: WithholdingTaxReviewResult }) {
  const status = statuses[data.status];
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3",
          status.tone,
        )}
        role="status"
      >
        {data.status === "CLEARED" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{status.label}</p>
          <p className="mt-1 text-xs leading-relaxed">{status.description}</p>
        </div>
      </div>
      {data.status !== "NOT_READY" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Amount
              label="源泉集計額"
              value={t.aggregatedTax}
              note={`${data.period.startDate}〜${data.period.endDate}`}
            />
            <Amount
              label="期中の年末調整・還付等"
              value={t.adjustments}
              note="追加徴収＋ / 還付−"
            />
            <Amount
              label="半期末の源泉預り金"
              value={t.periodEndBalance}
              note={`${data.period.endDate} / MF試算表`}
            />
            <Amount
              label="確認日までの納付額"
              value={t.payments}
              note={`${data.checkedThroughDate}まで / 半期終了後`}
            />
          </div>
          <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                納付後の対象期分残高
              </div>
              <div
                className={cn(
                  "mt-1 break-words text-2xl font-bold tabular-nums",
                  data.status === "CLEARED"
                    ? "text-emerald-700"
                    : t.remainingBalance !== 0 && t.remainingBalance !== null
                      ? "text-amber-700"
                      : "text-foreground",
                )}
              >
                {yen(t.remainingBalance)}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                半期末残高 − 納付額 ＋ その他増減。翌期徴収分は含みません。
              </p>
            </div>
            <dl className="space-y-1 text-xs">
              <ValueRow
                label="翌期に新たに徴収した源泉税"
                value={t.nextPeriodTax}
              />
              <ValueRow
                label="その他増減（確認期間）"
                value={t.otherMovements}
              />
              <ValueRow label="確認日の源泉預り金残高" value={t.bookBalance} />
              <ValueRow
                label="半期末残高と集計＋調整との差"
                value={t.balanceDifference}
              />
            </dl>
          </div>
          {data.issues.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" />
                確認が必要な項目
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-900">
                {data.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {data.accounts.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[780px] text-xs">
                <caption className="pb-2 text-left font-semibold">
                  源泉科目ごとの照合
                </caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left font-medium">
                      勘定科目 / 補助科目
                    </th>
                    {[
                      "半期末残高",
                      "納付額",
                      "翌期徴収分",
                      "確認日残高",
                      "対象期分残高",
                    ].map((label) => (
                      <th
                        key={label}
                        className="py-2 pl-3 text-right font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((account) => (
                    <tr
                      key={JSON.stringify([
                        account.accountName,
                        account.subAccountName,
                      ])}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 font-medium">
                        {account.accountName}
                        {account.subAccountName
                          ? ` / ${account.subAccountName}`
                          : ""}
                      </td>
                      {[
                        account.periodEndBalance,
                        account.payments,
                        account.nextPeriodTax,
                        account.bookBalance,
                        account.remainingBalance,
                      ].map((amount, index) => (
                        <td
                          key={index}
                          className={cn(
                            "py-2 pl-3 text-right tabular-nums",
                            index === 4 && "font-semibold",
                            index === 4 &&
                              amount !== 0 &&
                              amount !== null &&
                              "text-amber-700",
                          )}
                        >
                          {yen(amount)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium">
              照合に使った仕訳（{data.details.length.toLocaleString("ja-JP")}
              件）
            </summary>
            <JournalDetails details={data.details} />
          </details>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {data.checkedThroughDate}
            時点の仕訳で照合しています。確認日残高は半期末残高とその後の仕訳から算出しています。
            残高0は帳簿上の照合結果で、納付書の提出・受理状況は別途確認してください。
          </p>
        </>
      )}
    </div>
  );
}

function Amount({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-lg font-bold tabular-nums">
        {yen(value)}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{yen(value)}</dd>
    </div>
  );
}

function JournalDetails({
  details,
}: {
  details: WithholdingTaxReviewResult["details"];
}) {
  const kinds = {
    WITHHOLDING: "源泉徴収",
    ADJUSTMENT: "年末調整・還付等",
    PAYMENT: "納付",
    NEXT_PERIOD: "翌期分の徴収",
    UNCLASSIFIED: "用途を確認",
  };
  return (
    <div className="mt-3 max-h-80 overflow-auto">
      <table className="w-full min-w-[850px] text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            {[
              "日付 / 仕訳番号",
              "区分",
              "源泉科目",
              "増減額（貸方＋）",
              "摘要",
            ].map((label, i) => (
              <th
                key={label}
                className={cn(
                  "px-2 py-2 font-medium",
                  i === 3 ? "text-right" : "text-left",
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {details.length ? (
            details.map((detail, i) => (
              <tr
                key={`${detail.journalId}:${i}`}
                className="border-b last:border-0"
              >
                <td className="whitespace-nowrap px-2 py-2">
                  {detail.date}
                  <span className="ml-2 text-muted-foreground">
                    {detail.journalNumber ?? "番号なし"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  {kinds[detail.kind]}
                </td>
                <td className="px-2 py-2">
                  {detail.accountName}
                  {detail.subAccountName ? ` / ${detail.subAccountName}` : ""}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {detail.amount > 0 ? "+" : ""}
                  {yen(detail.amount)}
                </td>
                <td className="min-w-48 px-2 py-2 text-muted-foreground">
                  {detail.memo ?? "摘要なし"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                対象仕訳はありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function yen(value: number | null): string {
  return value === null ? "未確認" : `¥${value.toLocaleString("ja-JP")}`;
}
