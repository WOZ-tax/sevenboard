import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [
    HttpModule.register({ timeout: 60000, maxRedirects: 3 }),
    AuthModule,
    PrismaModule,
    MfModule,
    SupabaseModule,
  ],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
