import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { KintoneModule } from '../kintone/kintone.module';
import { MonthlyCloseModule } from '../monthly-close/monthly-close.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000, maxRedirects: 3 }),
    PrismaModule,
    MfModule,
    KintoneModule,
    MonthlyCloseModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
