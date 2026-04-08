import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './common/cache.module';
import { AuditLogInterceptor } from './common/audit-log.interceptor';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ActualsModule } from './actuals/actuals.module';
import { ReportsModule } from './reports/reports.module';
import { CashflowModule } from './cashflow/cashflow.module';
import { MfModule } from './mf/mf.module';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { CommentsModule } from './comments/comments.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MastersModule } from './masters/masters.module';
import { AdvisorModule } from './advisor/advisor.module';
import { AlertsModule } from './alerts/alerts.module';
import { SimulationModule } from './simulation/simulation.module';
import { SyncModule } from './sync/sync.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CalendarModule } from './calendar/calendar.module';
import { KintoneModule } from './kintone/kintone.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    BudgetsModule,
    ActualsModule,
    ReportsModule,
    CashflowModule,
    MfModule,
    AiModule,
    CommentsModule,
    IntegrationsModule,
    MastersModule,
    AdvisorModule,
    AlertsModule,
    SimulationModule,
    SyncModule,
    OnboardingModule,
    CalendarModule,
    KintoneModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
