import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { AuthModule } from '../auth/auth.module';
import { SyncModule } from '../sync/sync.module';
import { MfModule } from '../mf/mf.module';
import { KintoneModule } from '../kintone/kintone.module';

@Module({
  imports: [AuthModule, SyncModule, MfModule, KintoneModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
