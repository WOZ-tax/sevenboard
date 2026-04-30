import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { AuthModule } from '../auth/auth.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, PrismaModule, MfModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
