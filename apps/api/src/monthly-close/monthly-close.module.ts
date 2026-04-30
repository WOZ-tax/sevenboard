import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MonthlyCloseService } from './monthly-close.service';
import { MonthlyCloseController } from './monthly-close.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MonthlyCloseController],
  providers: [MonthlyCloseService],
  exports: [MonthlyCloseService],
})
export class MonthlyCloseModule {}
