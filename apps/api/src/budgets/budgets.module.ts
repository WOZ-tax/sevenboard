import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { ResolveOrgFromBudgetParam } from './resolve-org-param.interceptor';

@Module({
  // OrgAccessService を DI するため AuthModule を import
  imports: [AuthModule, PrismaModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, ResolveOrgFromBudgetParam],
  exports: [BudgetsService],
})
export class BudgetsModule {}
