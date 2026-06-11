import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { makeTenantScopeAuditMiddleware } from '../common/tenant-scope-audit';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // テナント分離は単層(アプリ層スコープのみ)。tenantId スコープを欠いた bulk クエリを
    // 実行時に検出する監査ミドルウェア。既定 warn(ログのみ)、TENANT_SCOPE_AUDIT=throw で強制。
    this.$use(makeTenantScopeAuditMiddleware(this.logger));
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async orgScope(orgId: string): Promise<{ orgId: string; tenantId: string }> {
    const org = await this.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tenantId: true },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }
    return { orgId: org.id, tenantId: org.tenantId };
  }
}
