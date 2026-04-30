import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActualsController } from './actuals.controller';
import { ActualsService } from './actuals.service';

@Module({
  imports: [AuthModule],
  controllers: [ActualsController],
  providers: [ActualsService],
  exports: [ActualsService],
})
export class ActualsModule {}
