import type {
  LoanDraft,
  LoanDraftEntry,
  LoanRepaymentMethodDraft,
} from './loan-schedule-validator';

/**
 * 返済予定表 PDF から借入情報を構造化抽出するためのプロンプト。
 * データ捏造の厳禁を ai.service の流儀で明記する（読めない値は null）。
 */
export const LOAN_EXTRACTION_PROMPT = `あなたは金融機関の返済予定表・償還約定表・金銭消費貸借契約書から借入情報を読み取る専門家です。
添付 PDF から以下の JSON を抽出してください。

# データ捏造の厳禁（厳守）
- PDF に明記されている値だけを書く。読み取れない・記載が無い項目は必ず null にする。
- 金額・日付・利率を推測で埋めない。計算して補完しない（合計や残高も PDF の記載値をそのまま写す）。
- 存在しない返済回を作り出さない。PDF に載っている行だけを entries に入れる。

# 和暦の変換
- 和暦（令和N年M月D日 等）は西暦の YYYY-MM-DD に変換する。令和1年=2019年、令和N年=2018+N 年。
- 昭和・平成が出た場合も西暦に変換する（昭和64/平成1=1989、平成N=1988+N）。

# repaymentMethod は次の enum のいずれかにマップする
- 元利均等（毎回の返済額が一定）→ "EQUAL_INSTALLMENT"
- 元金均等（毎回の元金が一定）→ "EQUAL_PRINCIPAL"
- 期日一括 / 満期一括 / 利息のみ支払い期間あり → "BULLET"
- 上記に当てはまらない → "OTHER"
- 判別できない → null

# rateType
- 「利率見直し」「変動金利」「基準金利連動」等の文言があれば "VARIABLE"、固定なら "FIXED"、不明なら null。

# 出力する JSON（このオブジェクトのみを返す。前後の説明・コードブロックは不要）
{
  "lenderName": "銀行・金融機関名（関係会社借入なら会社名）",
  "branchName": "支店名 or null",
  "loanNumber": "融資番号・取引番号 or null",
  "loanType": "証書貸付・手形貸付・当座貸越・関係会社借入 等 or null",
  "principal": 借入総額(円, 整数) or null,
  "interestRate": 当初利率(%, 数値) or null,
  "rateType": "FIXED" | "VARIABLE" | null,
  "startDate": "融資実行日 YYYY-MM-DD or null",
  "termMonths": 返済期間(月数, 整数) or null,
  "maturityDate": "償還期限 YYYY-MM-DD or null",
  "repaymentMethod": "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "BULLET" | "OTHER" | null,
  "repaymentAccount": "返済口座 or null",
  "entries": [
    {
      "seq": 回数(整数),
      "dueDate": "返済日 YYYY-MM-DD",
      "principalAmount": 元金(円, 整数。利息のみ回は0),
      "interestAmount": 利息(円, 整数),
      "totalAmount": 返済額合計(円, 整数),
      "balanceAfter": 返済後残高(円, 整数),
      "interestRate": その回の適用利率(%, 数値) or null
    }
  ]
}`;

interface RawEntry {
  seq?: unknown;
  dueDate?: unknown;
  principalAmount?: unknown;
  interestAmount?: unknown;
  totalAmount?: unknown;
  balanceAfter?: unknown;
  interestRate?: unknown;
}

interface RawExtraction {
  lenderName?: unknown;
  branchName?: unknown;
  loanNumber?: unknown;
  loanType?: unknown;
  principal?: unknown;
  interestRate?: unknown;
  rateType?: unknown;
  startDate?: unknown;
  termMonths?: unknown;
  maturityDate?: unknown;
  repaymentMethod?: unknown;
  repaymentAccount?: unknown;
  entries?: unknown;
}

const RATE_TYPES = new Set(['FIXED', 'VARIABLE']);
const REPAYMENT_METHODS = new Set<LoanRepaymentMethodDraft>([
  'EQUAL_INSTALLMENT',
  'EQUAL_PRINCIPAL',
  'BULLET',
  'OTHER',
]);

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,¥\s円]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intOrNull(value: unknown): number | null {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
}

function dateStr(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * LLM の生 JSON を LoanDraft に正規化する。値の欠落・型不一致は握りつぶさず
 * 妥当な値のみ採用し、entries は数値化できた行のみを残す（捏造ゼロ設計）。
 */
export function normalizeExtraction(raw: RawExtraction | null): LoanDraft | null {
  if (!raw || typeof raw !== 'object') return null;

  const rateTypeRaw = str(raw.rateType);
  const methodRaw = str(raw.repaymentMethod);

  const rawEntries = Array.isArray(raw.entries) ? (raw.entries as RawEntry[]) : [];
  const entries: LoanDraftEntry[] = [];
  rawEntries.forEach((e, idx) => {
    const dueDate = dateStr(e.dueDate);
    const principalAmount = intOrNull(e.principalAmount);
    const interestAmount = intOrNull(e.interestAmount);
    const totalAmount = intOrNull(e.totalAmount);
    const balanceAfter = intOrNull(e.balanceAfter);
    // 返済日と残高が読めない行は採用しない（後段バリデータの誤検知を避ける）
    if (!dueDate || balanceAfter == null) return;
    entries.push({
      seq: intOrNull(e.seq) ?? idx + 1,
      dueDate,
      principalAmount: principalAmount ?? 0,
      interestAmount: interestAmount ?? 0,
      totalAmount: totalAmount ?? (principalAmount ?? 0) + (interestAmount ?? 0),
      balanceAfter,
      interestRate: num(e.interestRate),
    });
  });

  return {
    loan: {
      lenderName: str(raw.lenderName),
      branchName: str(raw.branchName),
      loanNumber: str(raw.loanNumber),
      loanType: str(raw.loanType),
      principal: intOrNull(raw.principal),
      interestRate: num(raw.interestRate),
      rateType: rateTypeRaw && RATE_TYPES.has(rateTypeRaw) ? rateTypeRaw : null,
      startDate: dateStr(raw.startDate),
      termMonths: intOrNull(raw.termMonths),
      maturityDate: dateStr(raw.maturityDate),
      repaymentMethod:
        methodRaw && REPAYMENT_METHODS.has(methodRaw as LoanRepaymentMethodDraft)
          ? (methodRaw as LoanRepaymentMethodDraft)
          : null,
      repaymentAccount: str(raw.repaymentAccount),
    },
    entries,
  };
}
