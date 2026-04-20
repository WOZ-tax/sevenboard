import { Module } from '@nestjs/common';
import { BusinessEventsController } from './business-events.controller';
import { BusinessEventsService } from './business-events.service';

@Module({
  controllers: [BusinessEventsController],
  providers: [BusinessEventsService],
  exports: [BusinessEventsService],
})
export class BusinessEventsModule {}
