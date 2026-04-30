import { Module } from '@nestjs/common';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [MastersController],
  providers: [MastersService],
  exports: [MastersService],
})
export class MastersModule {}
