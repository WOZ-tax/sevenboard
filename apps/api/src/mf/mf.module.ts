import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MfApiService } from './mf-api.service';
import { MfTransformService } from './mf-transform.service';
import { ReviewService } from './review.service';
import { MfController } from './mf.controller';

@Module({
  imports: [HttpModule.register({ timeout: 30000, maxRedirects: 3 }), PrismaModule],
  controllers: [MfController],
  providers: [MfApiService, MfTransformService, ReviewService],
  exports: [MfApiService, MfTransformService, ReviewService],
})
export class MfModule {}
