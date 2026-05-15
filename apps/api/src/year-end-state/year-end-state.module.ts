import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { YearEndStateController } from './year-end-state.controller';
import { YearEndStateService } from './year-end-state.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 15_000 }),
    forwardRef(() => AuthModule),
    PrismaModule,
  ],
  controllers: [YearEndStateController],
  providers: [YearEndStateService],
  exports: [YearEndStateService],
})
export class YearEndStateModule {}
