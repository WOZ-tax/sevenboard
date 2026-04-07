import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActualsService {
  constructor(private prisma: PrismaService) {}

  async findByOrg(
    orgId: string,
    query: { month?: string; accountId?: string; departmentId?: string },
  ) {
    const where: any = { orgId };

    if (query.month) {
      where.month = new Date(query.month);
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

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
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
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 3) continue;

      const accountCode = cols[accountCodeIdx];
      const month = cols[monthIdx];
      const amount = parseFloat(cols[amountIdx]);
      const deptName = deptIdx >= 0 ? cols[deptIdx] : null;

      if (isNaN(amount)) {
        errors.push({ line: i + 1, error: `Invalid amount: ${cols[amountIdx]}` });
        continue;
      }

      // Resolve account
      const account = await this.prisma.accountMaster.findFirst({
        where: { orgId, code: accountCode },
      });
      if (!account) {
        errors.push({ line: i + 1, error: `Account not found: ${accountCode}` });
        continue;
      }

      // Resolve department (optional)
      let departmentId: string | null = null;
      if (deptName) {
        const dept = await this.prisma.department.findFirst({
          where: { orgId, name: deptName },
        });
        if (dept) {
          departmentId = dept.id;
        }
      }

      try {
        const entry = await this.prisma.actualEntry.upsert({
          where: {
            actual_entry_with_dept: {
              orgId,
              accountId: account.id,
              departmentId: departmentId,
              month: new Date(month),
            },
          },
          update: {
            amount,
            source: 'CSV_IMPORT',
            syncedAt: new Date(),
          },
          create: {
            orgId,
            accountId: account.id,
            departmentId,
            month: new Date(month),
            amount,
            source: 'CSV_IMPORT',
            syncedAt: new Date(),
          },
        });
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
}
