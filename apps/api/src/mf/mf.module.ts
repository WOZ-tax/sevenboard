import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfApiService } from './mf-api.service';
import { MfV3ClientService } from './mf-v3-client.service';
import { MfTransformService } from './mf-transform.service';
import { ReviewService } from './review.service';
import { MfController } from './mf.controller';
import { KintoneModule } from '../kintone/kintone.module';
import { DataHealthModule } from '../data-health/data-health.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 30000, maxRedirects: 3 }),
    forwardRef(() => AuthModule),
    PrismaModule,
    KintoneModule,
    DataHealthModule,
    MonthlyCloseModule,
  ],
  controllers: [MfController],
  providers: [MfApiService, MfV3ClientService, MfTransformService, ReviewService],
  exports: [MfApiService, MfV3ClientService, MfTransformService, ReviewService],
})
export class MfModule {}
