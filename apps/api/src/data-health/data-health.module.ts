import { Module, forwardRef } from '@nestjs/common';
import { DataHealthController } from './data-health.controller';
import { DataHealthService } from './data-health.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule → MfModule → KintoneModule → DataHealthModule → AuthModule の循環を断つ
  imports: [forwardRef(() => AuthModule)],
  controllers: [DataHealthController],
  providers: [DataHealthService],
  exports: [DataHealthService],
})
export class DataHealthModule {}
