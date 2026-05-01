import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { AuthModule } from '../auth/auth.module';
import { SentinelModule } from '../sentinel/sentinel.module';
import { HealthSnapshotsModule } from '../health-snapshots/health-snapshots.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    HttpModule,
    PrismaModule,
    MfModule,
    SentinelModule,
    HealthSnapshotsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
