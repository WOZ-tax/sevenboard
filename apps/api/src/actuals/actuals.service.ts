import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActualsService {
  constructor(private prisma: PrismaService) {}

  async findByOrg(
    orgId: string,
    query: { month?: string; accountId?: string; departmentId?: string },
  ) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const where: any = { tenantId, orgId };

    if (query.month) {
      const monthDate = new Date(query.month);
      if (isNaN(monthDate.getTime())) {
        throw new BadRequestException(`Invalid month: ${query.month}`);
      }
      where.month = monthDate;
    }
    if (query.accountId) {
      where.accountId = query.accountId;
    }
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }

    return this.prisma.actualEntry.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true, category: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ month: 'asc' }, { account: { displayOrder: 'asc' } }],
    });
  }

  async importCsv(orgId: string, csvData: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const MAX_CSV_ROWS = 10000;
    // Parse CSV: expected columns: accountCode, departmentName (optional), month (YYYY-MM-DD), amount
    const lines = csvData.trim().split('\n');
    if (lines.length > MAX_CSV_ROWS + 1) {
      throw new BadRequestException(
        `CSVの行数が上限(${MAX_CSV_ROWS}行)を超えています`,
      );
    }
    if (lines.length < 2) {
      throw new BadRequestException('CSV must have a header row and at least one data row');
    }

    const header = this.parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const accountCodeIdx = header.indexOf('accountcode');
    const monthIdx = header.indexOf('month');
    const amountIdx = header.indexOf('amount');
    const deptIdx = header.indexOf('departmentname');

    if (accountCodeIdx === -1 || monthIdx === -1 || amountIdx === -1) {
      throw new BadRequestException(
        'CSV header must include: accountCode, month, amount',
      );
    }

    const results = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]).map((c) => c.trim());
      if (cols.length < 3) continue;

      const accountCode = cols[accountCodeIdx];
      const month = cols[monthIdx];
      const rawAmount = cols[amountIdx];
      const amount = this.parseAmount(rawAmount);
      const deptName = deptIdx >= 0 ? cols[deptIdx] || null : null;

      if (amount === null) {
        errors.push({ line: i + 1, error: `Invalid amount: ${rawAmount}` });
        continue;
      }

      // Resolve account
      const account = await this.prisma.accountMaster.findFirst({
        where: { tenantId, orgId, code: accountCode },
      });
      if (!account) {
        errors.push({ line: i + 1, error: `Account not found: ${accountCode}` });
        continue;
      }

      // Resolve department (optional)
      let departmentId: string | null = null;
      if (deptName) {
        const dept = await this.prisma.department.findFirst({
          where: { tenantId, orgId, name: deptName },
        });
        if (dept) {
          departmentId = dept.id;
        }
      }

      const monthDate = new Date(month);
      if (isNaN(monthDate.getTime())) {
        errors.push({ line: i + 1, error: `Invalid month: ${month}` });
        continue;
      }

      try {
        const now = new Date();
        const existing = await this.prisma.actualEntry.findFirst({
          where: {
            tenantId,
            orgId,
            accountId: account.id,
            departmentId,
            month: monthDate,
          },
        });
        let entry;
        if (existing) {
          entry = await this.prisma.actualEntry.update({
            where: { id: existing.id },
            data: {
              amount,
              source: 'CSV_IMPORT',
              syncedAt: now,
            },
          });
        } else {
          entry = await this.prisma.actualEntry.create({
            data: {
              tenantId,
              orgId,
              accountId: account.id,
              departmentId,
              month: monthDate,
              amount,
              source: 'CSV_IMPORT',
              syncedAt: now,
            },
          });
        }
        results.push(entry);
      } catch (err) {
        errors.push({ line: i + 1, error: err.message });
      }
    }

    return {
      imported: results.length,
      errors: errors.length,
      errorDetails: errors,
    };
  }

  /**
   * Minimal RFC4180-ish CSV line parser: handles double-quoted fields
   * (so values containing commas, e.g. "1,234,567", are not split) and
   * escaped quotes ("") inside quoted fields. No external dependency.
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else if (ch === '\r') {
        // strip stray CR (CRLF line endings)
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  /**
   * Parse a JPY amount, tolerating thousands separators (1,234,567) and
   * currency markers (¥, 円, whitespace). Returns an integer yen value, or
   * null if the cleaned value is not a finite whole number.
   */
  private parseAmount(raw: string): number | null {
    if (raw == null) return null;
    const cleaned = raw
      .replace(/[¥円,\s]/g, '')
      .replace(/[０-９]/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0xfee0),
      );
    if (cleaned === '' || cleaned === '-' || cleaned === '+') return null;
    const value = parseFloat(cleaned);
    if (!Number.isFinite(value)) return null;
    // amounts are JPY (integer yen); reject fractional values
    if (!Number.isInteger(value)) return null;
    return value;
  }
}
