import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
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
