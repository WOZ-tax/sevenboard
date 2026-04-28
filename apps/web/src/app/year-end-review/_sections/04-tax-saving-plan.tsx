"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Tier = 1 | 2 | 3 | 4;

interface SavingItem {
  id: string;
  tier: Tier;
  title: string;
  effect: string;
  /** 1行サマリ */
  summary: string;
  /** 留意事項 */
  caveat?: string;
}

const ITEMS: SavingItem[] = [
  // Tier 1: 王道
  {
    id: "safety-kyosai",
    tier: 1,
    title: "経営セーフティ共済（倒産防止共済）",
    effect: "全額損金 / 月額最大20万 / 年額最大240万 / 総額800万",
    summary: "中小企業の連鎖倒産を防ぐ国の制度。掛金が全額損金算入され、40ヶ月以上で解約返戻率100%。",
    caveat: "解約返戻金は益金。出口戦略（赤字年度や退職金支給に合わせた解約）が必須。",
  },
  {
    id: "small-biz-kyosai",
    tier: 1,
    title: "小規模企業共済（役員個人）",
    effect: "個人の所得控除 / 月額最大7万 / 年額最大84万",
    summary: "役員個人の退職金準備。掛金は全額所得控除で、所得税・住民税が下がる。役員報酬シミュ⑤と連動して個人手取りが改善。",
    caveat: "解約時に共済金として受取り、退職所得 or 公的年金等の雑所得として課税。",
  },
  // Tier 2: 資金不要型（損失計上系）
  {
    id: "bad-debt",
    tier: 2,
    title: "貸倒処理（売掛金等）",
    effect: "▲法人税等 ▲消費税等",
    summary: "回収不能な債権を貸倒損失として処理。",
    caveat: "債権放棄の内容証明郵便送付など要件あり。事業年度内に手続き。",
  },
  {
    id: "inventory-write-down",
    tier: 2,
    title: "棚卸評価損の計上",
    effect: "▲法人税等",
    summary: "破損・陳腐化した在庫の評価損計上。",
    caveat: "破損写真等エビデンス必須。評価方法の変更後単価の合理的理由を残す。",
  },
  {
    id: "securities-write-down",
    tier: 2,
    title: "有価証券評価損の計上",
    effect: "▲法人税等",
    summary: "上場有価証券の含み損は売却で実現可能。",
    caveat: "同時に買い戻すクロス取引は売買がなかったとみなされる（否認リスク）。",
  },
  {
    id: "asset-disposal",
    tier: 2,
    title: "固定資産除却・有姿除却",
    effect: "▲法人税等",
    summary: "未使用の固定資産を除却損で経費計上。物理廃棄が原則だが、撤去困難な場合は有姿除却も可。",
    caveat: "有姿除却は3要件（使用完全廃止 / 今後使用見込み無し / 他用途転用不可）を満たし、議事録・現況写真が必要。",
  },
  // Tier 3: 必然性があれば
  {
    id: "year-end-bonus",
    tier: 3,
    title: "決算賞与（従業員還元）",
    effect: "▲法人税等",
    summary: "従業員への利益還元として支給。全額経費計上。",
    caveat: "3要件（期末までに全員へ支給額通知 / 期末までに損金経理(未払計上) / 1ヶ月以内に支払完了）。",
  },
  {
    id: "major-repair",
    tier: 3,
    title: "大規模修繕の実施",
    effect: "▲法人税等 ▲消費税等",
    summary: "現状復旧修繕は全額経費計上可能。期末までの完了が条件。",
    caveat: "機能向上や耐用年数延長は資本的支出になり資産計上が必要。",
  },
  {
    id: "short-term-prepaid",
    tier: 3,
    title: "短期前払費用（年払切替）",
    effect: "▲法人税等",
    summary: "地代家賃・サーバー保守料・年契約サービスを月払→年払に切替。1年以内分は支払時に経費計上可。",
    caveat: "翌期以降も継続適用が必須（初年度のみ効果）。賃貸人が個人の場合の家賃年払いは慎重判断。",
  },
  {
    id: "annual-life-insurance",
    tier: 3,
    title: "年払生命保険",
    effect: "▲法人税等（保険種類による）",
    summary: "保障を確保しつつ、1年分の保険料を支払時に経費化。",
    caveat: "解約返戻金は益金。返戻率ピークと出口戦略（退職金支給等）を合わせた設計が必須。",
  },
  // Tier 4: 慎重判断
  {
    id: "operating-lease",
    tier: 4,
    title: "オペレーティングリース",
    effect: "▲法人税等（初年度70-80%損金）",
    summary: "航空機・船舶等のリース事業に匿名組合出資。突発的な高収益対策として利益を数年〜10年後に繰延。",
    caveat: "出口戦略（役員退職金・大型設備投資）が無い加入は単なる課税の先送り。資金繰り圧迫リスク大。",
  },
  {
    id: "company-housing",
    tier: 4,
    title: "社宅制度の活用",
    effect: "▲法人税等",
    summary: "役員・従業員の自宅を法人契約に切替。家賃の大部分を経費化、個人負担を低水準に抑える。",
    caveat: "就業規則整備、法人契約必須、賃料相当額の自己負担額の計算ルール遵守。",
  },
  {
    id: "travel-allowance",
    tier: 4,
    title: "旅費日当規程の導入",
    effect: "▲法人税等 ▲消費税等",
    summary: "出張日当を規程で定めて支給。法人で経費、個人は非課税。",
    caveat: "旅費規程作成と株主総会決議が必要。常識的な金額・回数で運用。",
  },
  {
    id: "used-asset-short-depreciation",
    tier: 4,
    title: "中古資産の短期償却",
    effect: "▲法人税等",
    summary: "法定耐用年数経過済の中古資産は最短2年で経費化可能。",
    caveat: "節税目的のみの購入（実態無し）は否認リスク。事業上の必然性が必要。",
  },
  {
    id: "fy-change",
    tier: 4,
    title: "決算期の変更",
    effect: "▲法人税等（時期調整）",
    summary: "非経常的な大きな利益が単発で出る場合、決算期変更で納税時期をずらして対策期間を確保。",
    caveat: "メリットが大きい場合かつ利益操作とみなされない合理的説明ができるケースに限る。",
  },
  {
    id: "spinoff",
    tier: 4,
    title: "分社化の検討",
    effect: "軽減税率枠ダブル / 消費税免税期間活用",
    summary: "中小法人の所得800万円以下軽減枠を複数利用。リスク分散・部門別採算管理。",
    caveat: "事務負担増、均等割の重複、資金移動の制約。年間所得が数千万円規模で安定し多角化が進む段階での検討。",
  },
];

const TIER_META: Record<Tier, { label: string; tone: string; hint: string }> = {
  1: {
    label: "王道（強く推奨）",
    tone: "border-emerald-500/40 bg-emerald-50/50",
    hint: "資金流出が少なく、出口戦略も組みやすい。まずここから",
  },
  2: {
    label: "資金不要型（損失計上）",
    tone: "border-blue-400/40 bg-blue-50/50",
    hint: "資金流出ゼロ。整理対象があれば検討",
  },
  3: {
    label: "必然性があれば（資金流出あり）",
    tone: "border-amber-400/40 bg-amber-50/50",
    hint: "事業上の必然性 / 出口戦略が説明できるときのみ",
  },
  4: {
    label: "慎重判断（リスク・事務負担大）",
    tone: "border-rose-400/40 bg-rose-50/50",
    hint: "弊社にご相談ください",
  },
};

export function TaxSavingPlanSection() {
  const [showTier4, setShowTier4] = useState(false);

  const groupedItems: Record<Tier, SavingItem[]> = { 1: [], 2: [], 3: [], 4: [] };
  ITEMS.forEach((it) => groupedItems[it.tier].push(it));

  return (
    <div className="space-y-5">
      <StanceBanner />

      {([1, 2, 3] as Tier[]).map((tier) => (
        <TierBlock key={tier} tier={tier} items={groupedItems[tier]} />
      ))}

      {/* Tier 4 は折りたたみ */}
      <div>
        <button
          type="button"
          onClick={() => setShowTier4((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-rose-200 bg-rose-50/50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Tier 4: 慎重判断（{groupedItems[4].length}件）
            <span className="ml-1 font-normal text-rose-600/80">— 弊社にご相談ください</span>
          </span>
          {showTier4 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showTier4 && (
          <div className="mt-2">
            <TierBlock tier={4} items={groupedItems[4]} hideHeader />
          </div>
        )}
      </div>

      <WarningBanner />
    </div>
  );
}

function StanceBanner() {
  return (
    <div className="rounded-md border-l-4 border-rose-500 bg-rose-50/60 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-rose-700">
        <AlertTriangle className="h-4 w-4" />
        節税は目的ではなく「手段」です
      </div>
      <p className="text-xs leading-relaxed text-rose-900/90">
        過度な節税はキャッシュフローを毀損し、銀行与信や事業継続性を損ないます。
        以下のいずれかに該当する場合のみ検討してください。
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-rose-900/90">
        <li>✓ 手元キャッシュに十分な余裕がある</li>
        <li>✓ 経営上必要な投資・支出として説明できる</li>
        <li>✓ 借入金の個人保証に対するリスクヘッジ目的</li>
      </ul>
    </div>
  );
}

function TierBlock({
  tier,
  items,
  hideHeader = false,
}: {
  tier: Tier;
  items: SavingItem[];
  hideHeader?: boolean;
}) {
  const meta = TIER_META[tier];
  return (
    <div className={cn("rounded-md border", meta.tone)}>
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-current/10 px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            {tier === 1 && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
            <span>Tier {tier}: {meta.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{meta.hint}</span>
        </div>
      )}
      <div className={cn("grid gap-2 p-3", tier === 1 ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {items.map((it) => (
          <SavingCard key={it.id} item={it} emphasized={tier === 1} />
        ))}
      </div>
    </div>
  );
}

function SavingCard({ item, emphasized }: { item: SavingItem; emphasized: boolean }) {
  return (
    <div
      className={cn(
        "rounded border bg-white p-3 transition-shadow hover:shadow",
        emphasized && "ring-1 ring-emerald-300",
      )}
    >
      <div className="mb-1 text-sm font-semibold leading-tight">{item.title}</div>
      <div className="mb-2 text-[11px] font-medium text-emerald-700">{item.effect}</div>
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
      {item.caveat && (
        <p className="rounded bg-amber-50/70 p-2 text-[11px] leading-relaxed text-amber-900">
          ⚠ {item.caveat}
        </p>
      )}
    </div>
  );
}

function WarningBanner() {
  return (
    <div className="rounded-md border-l-4 border-rose-700 bg-rose-50 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-rose-800">
        <AlertTriangle className="h-4 w-4" />
        絶対に避けるべきスキーム
      </div>
      <ul className="space-y-1 text-xs leading-relaxed text-rose-900/90">
        <li>
          <strong>架空経費・売上除外・私的支出の経費化</strong> — 重加算税40%・銀行与信壊滅・税務署10年マーク・出口戦略(IPO/M&A)断絶。
        </li>
        <li>
          <strong>役員報酬を極端に下げ大半を事前確定届出給与で支給する社保節税スキーム</strong> — 日本年金機構が職権改定で否認するケース増加、年金受給権毀損、法人税不当減少認定リスク。
        </li>
        <li>
          <strong>節税目的のみの少額減価償却資産大量購入</strong>（ドローン等） — 令和4年度税制改正で封じ込め済み。実態の無い資産購入は否認。
        </li>
      </ul>
    </div>
  );
}
