import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MfApiService } from './mf-api.service';
import { MfTransformService } from './mf-transform.service';
import { ReviewService } from './review.service';
import { MfController } from './mf.controller';
import { KintoneModule } from '../kintone/kintone.module';
import { DataHealthModule } from '../data-health/data-health.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';

@Module({
  imports: [HttpModule.register({ timeout: 30000, maxRedirects: 3 }), PrismaModule, KintoneModule, DataHealthModule, MonthlyCloseModule],
  controllers: [MfController],
  providers: [MfApiService, MfTransformService, ReviewService],
  exports: [MfApiService, MfTransformService, ReviewService],
})
export class MfModule {}
