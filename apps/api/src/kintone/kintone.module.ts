import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KintoneApiService } from './kintone-api.service';
import { KintoneController } from './kintone.controller';
import { DataHealthModule } from '../data-health/data-health.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // OrgAccessService / InternalStaffGuard を DI するため AuthModule を import
  // AuthModule → MfModule → KintoneModule → AuthModule の循環参照を回避
  imports: [HttpModule, DataHealthModule, PrismaModule, forwardRef(() => AuthModule)],
  controllers: [KintoneController],
  providers: [KintoneApiService],
  exports: [KintoneApiService],
})
export class KintoneModule {}
