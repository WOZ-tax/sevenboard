import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { SupabaseService } from '../supabase/supabase.service';
import { createLlmProvider, extractJson, LlmProvider } from '../ai/llm-provider';
import { HttpService } from '@nestjs/axios';
import { TB_COL, MfReportRow } from '../mf/types/mf-api.types';
import {
  monthWindow,
  deriveCurrentBalance,
  deriveNextPayment,
  deriveCurrentRate,
  deriveTotals,
  DerivableLoan,
} from './loan-derive';
import {
  LOAN_EXTRACTION_PROMPT,
  normalizeExtraction,
} from './loan-extraction';
import { validateLoanSchedule } from './loan-schedule-validator';
import { CreateLoanDto, UpdateLoanDto, LoanScheduleEntryInput } from './dto/loan.dto';
import type {
  LoansListDto,
  LoanSummaryDto,
  LoanDetailDto,
  MfBookBalanceDto,
  LoanExtractResultDto,
} from './loans.types';

const STORAGE_BUCKET = 'loan-documents';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 3600;

/** Prisma include で使う型（scheduleEntries + documents 付き Loan） */
type LoanWithRelations = Prisma.LoanGetPayload<{
  include: { scheduleEntries: true; documents: true };
}>;

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);
  private llm: LlmProvider | null;

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private supabase: SupabaseService,
    private httpService: HttpService,
  ) {
    this.llm = createLlmProvider(httpService);
  }

  // ============================ 一覧 ============================

  async list(orgId: string, now: Date = new Date()): Promise<LoansListDto> {
    const loans = await this.prisma.loan.findMany({
      where: { orgId },
      include: { scheduleEntries: { orderBy: { seq: 'asc' } }, documents: true },
      orderBy: { createdAt: 'asc' },
    });

    const w = monthWindow(now);
    const summaries: LoanSummaryDto[] = loans.map((loan) => {
      const derivable = this.toDerivable(loan);
      const next = deriveNextPayment(derivable, w.monthEnd);
      return {
        id: loan.id,
        lenderName: loan.lenderName,
        branchName: loan.branchName,
        loanType: loan.loanType,
        principal: Number(loan.principal),
        interestRate: deriveCurrentRate(derivable, w),
        rateType: loan.rateType,
        startDate: toDateStr(loan.startDate),
        termMonths: loan.termMonths,
        maturityDate: toDateStr(loan.maturityDate),
        repaymentMethod: loan.repaymentMethod,
        status: loan.status,
        currentBalance: deriveCurrentBalance(derivable, w.monthEnd),
        nextDueDate: next ? toDateStr(next.dueDate) : null,
        nextPaymentAmount: next ? next.amount : null,
        driveUrl: loan.driveUrl,
      };
    });

    const activeDerivable = loans
      .filter((l) => l.status === 'ACTIVE')
      .map((l) => this.toDerivable(l));
    const totals = deriveTotals(activeDerivable, w);
    const mfBookBalance = await this.computeMfBookBalance(
      orgId,
      totals.outstandingBalance,
    );

    return { loans: summaries, totals, mfBookBalance };
  }

  // ============================ 詳細 ============================

  async get(orgId: string, loanId: string): Promise<LoanDetailDto> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, orgId },
      include: { scheduleEntries: { orderBy: { seq: 'asc' } }, documents: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return this.toDetailDto(loan);
  }

  // ============================ 作成 ============================

  async create(
    orgId: string,
    userId: string | undefined,
    dto: CreateLoanDto,
  ): Promise<LoanDetailDto> {
    const tenantId = await this.resolveTenantId(orgId);

    const loan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.loan.create({
        data: {
          tenantId,
          orgId,
          lenderName: dto.lenderName,
          branchName: dto.branchName ?? null,
          loanNumber: dto.loanNumber ?? null,
          loanType: dto.loanType ?? null,
          principal: BigInt(dto.principal),
          interestRate: dto.interestRate ?? null,
          rateType: dto.rateType,
          startDate: toDate(dto.startDate),
          termMonths: dto.termMonths ?? null,
          maturityDate: toDate(dto.maturityDate),
          repaymentMethod: dto.repaymentMethod,
          repaymentAccount: dto.repaymentAccount ?? null,
          driveUrl: dto.driveUrl ?? null,
          memo: dto.memo ?? null,
          status: dto.status,
          updatedById: userId ?? null,
          scheduleEntries: dto.scheduleEntries?.length
            ? { create: dto.scheduleEntries.map((e) => this.toEntryCreate(tenantId, e)) }
            : undefined,
        },
      });

      if (dto.documentId) {
        // アップロード済みドキュメントを紐付け（同一テナント/組織のもののみ）
        await tx.loanDocument.updateMany({
          where: { id: dto.documentId, orgId, tenantId, loanId: null },
          data: { loanId: created.id },
        });
      }

      return created;
    });

    return this.get(orgId, loan.id);
  }

  // ============================ 更新（基本情報） ============================

  async update(
    orgId: string,
    userId: string | undefined,
    loanId: string,
    dto: UpdateLoanDto,
  ): Promise<LoanDetailDto> {
    await this.assertLoanInOrg(orgId, loanId);

    await this.prisma.loan.update({
      where: { id: loanId },
      data: {
        ...(dto.lenderName !== undefined ? { lenderName: dto.lenderName } : {}),
        ...(dto.branchName !== undefined ? { branchName: dto.branchName } : {}),
        ...(dto.loanNumber !== undefined ? { loanNumber: dto.loanNumber } : {}),
        ...(dto.loanType !== undefined ? { loanType: dto.loanType } : {}),
        ...(dto.principal !== undefined ? { principal: BigInt(dto.principal) } : {}),
        ...(dto.interestRate !== undefined ? { interestRate: dto.interestRate } : {}),
        ...(dto.rateType !== undefined ? { rateType: dto.rateType } : {}),
        ...(dto.startDate !== undefined ? { startDate: toDate(dto.startDate) } : {}),
        ...(dto.termMonths !== undefined ? { termMonths: dto.termMonths } : {}),
        ...(dto.maturityDate !== undefined
          ? { maturityDate: toDate(dto.maturityDate) }
          : {}),
        ...(dto.repaymentMethod !== undefined
          ? { repaymentMethod: dto.repaymentMethod }
          : {}),
        ...(dto.repaymentAccount !== undefined
          ? { repaymentAccount: dto.repaymentAccount }
          : {}),
        ...(dto.driveUrl !== undefined ? { driveUrl: dto.driveUrl } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedById: userId ?? null,
      },
    });

    return this.get(orgId, loanId);
  }

  // ============================ スケジュール全置換 ============================

  async replaceSchedule(
    orgId: string,
    loanId: string,
    entries: LoanScheduleEntryInput[],
  ): Promise<LoanDetailDto> {
    const tenantId = await this.assertLoanInOrg(orgId, loanId);

    await this.prisma.$transaction([
      this.prisma.loanScheduleEntry.deleteMany({ where: { loanId } }),
      this.prisma.loanScheduleEntry.createMany({
        data: entries.map((e) => ({ loanId, ...this.toEntryCreate(tenantId, e) })),
      }),
    ]);

    return this.get(orgId, loanId);
  }

  // ============================ 削除 ============================

  async remove(orgId: string, loanId: string): Promise<{ deleted: true }> {
    await this.assertLoanInOrg(orgId, loanId);
    // scheduleEntries は onDelete: Cascade、documents は SetNull（原本 PDF は残す）
    await this.prisma.loan.delete({ where: { id: loanId } });
    return { deleted: true };
  }

  // ============================ PDF 抽出 ============================

  async extract(
    orgId: string,
    userId: string | undefined,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ): Promise<LoanExtractResultDto> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException('Only PDF files are supported');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    const tenantId = await this.resolveTenantId(orgId);

    // 1) Supabase Storage に保存（bucket が無ければ作成）
    const storagePath = `${tenantId}/${orgId}/${randomUUID()}.pdf`;
    await this.ensureBucket();
    const { error: uploadError } = await this.supabase.client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadError) {
      throw new BadRequestException(
        `Failed to store PDF: ${uploadError.message}`,
      );
    }

    const doc = await this.prisma.loanDocument.create({
      data: {
        tenantId,
        orgId,
        loanId: null,
        fileName: file.originalname,
        storagePath,
        contentType: 'application/pdf',
        sizeBytes: file.size,
        uploadedById: userId ?? null,
      },
    });

    // 2) LLM 抽出 → 決定論バリデータ。LLM 失敗でも documentId は返す。
    let draft: LoanExtractResultDto['draft'] = null;
    let validation: LoanExtractResultDto['validation'] = null;
    if (this.llm) {
      try {
        const res = await this.llm.generate(LOAN_EXTRACTION_PROMPT, {
          pdfBase64: file.buffer.toString('base64'),
          maxTokens: 8192,
          json: true,
        });
        const raw = extractJson<Record<string, unknown>>(res.text);
        draft = normalizeExtraction(raw);
        if (draft) validation = validateLoanSchedule(draft);
      } catch (err) {
        this.logger.warn(
          `Loan PDF extraction failed for org=${orgId} doc=${doc.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { documentId: doc.id, draft, validation };
  }

  // ============================ 原本ダウンロード ============================

  async getDocumentDownloadUrl(
    orgId: string,
    loanId: string,
    docId: string,
  ): Promise<{ url: string }> {
    const doc = await this.prisma.loanDocument.findFirst({
      where: { id: docId, loanId, orgId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const { data, error } = await this.supabase.client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(doc.storagePath, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) {
      throw new BadRequestException(
        `Failed to create download URL: ${error?.message ?? 'unknown error'}`,
      );
    }
    return { url: data.signedUrl };
  }

  // ============================ helpers ============================

  /** Storage bucket が無ければ private で作成する（既存なら何もしない）。 */
  private async ensureBucket(): Promise<void> {
    const storage = this.supabase.client.storage;
    const { data } = await storage.getBucket(STORAGE_BUCKET);
    if (data) return;
    const { error } = await storage.createBucket(STORAGE_BUCKET, { public: false });
    // 並行リクエストで既に作成済みの場合の "already exists" は無視する。
    if (error && !/exist/i.test(error.message)) {
      throw new BadRequestException(
        `Failed to prepare storage bucket: ${error.message}`,
      );
    }
  }

  private async resolveTenantId(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { tenantId: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org.tenantId;
  }

  /** 借入が org に属することを確認し tenantId を返す。 */
  private async assertLoanInOrg(orgId: string, loanId: string): Promise<string> {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, orgId },
      select: { tenantId: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan.tenantId;
  }

  private toEntryCreate(tenantId: string, e: LoanScheduleEntryInput) {
    return {
      tenantId,
      seq: e.seq,
      dueDate: new Date(`${e.dueDate}T00:00:00.000Z`),
      principalAmount: BigInt(e.principalAmount),
      interestAmount: BigInt(e.interestAmount),
      totalAmount: BigInt(e.totalAmount),
      balanceAfter: BigInt(e.balanceAfter),
      interestRate: e.interestRate ?? null,
      isEstimated: e.isEstimated ?? false,
    };
  }

  private toDerivable(loan: LoanWithRelations): DerivableLoan {
    return {
      principal: Number(loan.principal),
      interestRate: decToNum(loan.interestRate),
      status: loan.status,
      entries: loan.scheduleEntries.map((e) => ({
        seq: e.seq,
        dueDate: e.dueDate,
        principalAmount: Number(e.principalAmount),
        interestAmount: Number(e.interestAmount),
        totalAmount: Number(e.totalAmount),
        balanceAfter: Number(e.balanceAfter),
        interestRate: decToNum(e.interestRate),
      })),
    };
  }

  private toDetailDto(loan: LoanWithRelations): LoanDetailDto {
    return {
      id: loan.id,
      lenderName: loan.lenderName,
      branchName: loan.branchName,
      loanNumber: loan.loanNumber,
      loanType: loan.loanType,
      principal: Number(loan.principal),
      interestRate: decToNum(loan.interestRate),
      rateType: loan.rateType,
      startDate: toDateStr(loan.startDate),
      termMonths: loan.termMonths,
      maturityDate: toDateStr(loan.maturityDate),
      repaymentMethod: loan.repaymentMethod,
      repaymentAccount: loan.repaymentAccount,
      driveUrl: loan.driveUrl,
      memo: loan.memo,
      status: loan.status,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      scheduleEntries: loan.scheduleEntries.map((e) => ({
        id: e.id,
        seq: e.seq,
        dueDate: toDateStr(e.dueDate)!,
        principalAmount: Number(e.principalAmount),
        interestAmount: Number(e.interestAmount),
        totalAmount: Number(e.totalAmount),
        balanceAfter: Number(e.balanceAfter),
        interestRate: decToNum(e.interestRate),
        isEstimated: e.isEstimated,
      })),
      documents: loan.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  /**
   * MF 帳簿の借入金残高。BS 負債側で科目名が「借入金」を含む科目
   * （短期借入金/長期借入金/1年以内返済予定長期借入金 等。「役員借入金」は除外）の
   * 期末残高を合算。MF 未接続/失敗時は amount:null で返し 500 にしない。
   */
  private async computeMfBookBalance(
    orgId: string,
    ledgerOutstanding: number,
  ): Promise<MfBookBalanceDto> {
    try {
      const bs = await this.mfApi.getTrialBalanceBS(orgId);
      const liabRoot = bs.rows.find((r) => r.type === 'liabilities');
      const accounts: { name: string; amount: number }[] = [];
      collectLoanAccounts(liabRoot?.rows ?? [], accounts);
      const amount = accounts.reduce((sum, a) => sum + a.amount, 0);
      return { amount, accounts, diff: amount - ledgerOutstanding };
    } catch (err) {
      this.logger.warn(
        `MF book balance unavailable for org=${orgId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { amount: null, accounts: [], diff: null };
    }
  }
}

/**
 * BS 負債行ツリーを走査し、リーフ科目のうち名前が「借入金」を含み
 * 「役員借入金」を含まないものの期末残高を集める。親（子を持つ行）は
 * 二重計上を避けるため子へ降りるだけにする。
 */
function collectLoanAccounts(
  rows: MfReportRow[],
  out: { name: string; amount: number }[],
): void {
  for (const row of rows) {
    if (row.rows && row.rows.length > 0) {
      collectLoanAccounts(row.rows, out);
      continue;
    }
    if (row.name.includes('借入金') && !row.name.includes('役員借入金')) {
      out.push({ name: row.name, amount: (row.values[TB_COL.CLOSING] as number) || 0 });
    }
  }
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateStr(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function decToNum(value: Prisma.Decimal | null): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toString());
}
