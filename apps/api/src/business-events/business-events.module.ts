import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessEventsController } from './business-events.controller';
import { BusinessEventsService } from './business-events.service';

@Module({
  imports: [AuthModule],
  controllers: [BusinessEventsController],
  providers: [BusinessEventsService],
  exports: [BusinessEventsService],
})
export class BusinessEventsModule {}
