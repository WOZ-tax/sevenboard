import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfModule } from '../mf/mf.module';
import { LocabenController } from './locaben.controller';
import { LocabenService } from './locaben.service';

@Module({
  imports: [forwardRef(() => AuthModule), MfModule],
  controllers: [LocabenController],
  providers: [LocabenService],
  exports: [LocabenService],
})
export class LocabenModule {}
