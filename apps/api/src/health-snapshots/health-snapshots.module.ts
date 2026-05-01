import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { HealthSnapshotsController } from './health-snapshots.controller';
import { HealthSnapshotsService } from './health-snapshots.service';
import { HealthQuestionsService } from './health-questions.service';

/**
 * AI CFO 経営健康モニター (会計レビュー ① 健康サマリー)。
 *
 * - HealthSnapshotsService: スコア計算と DB 永続化
 * - HealthQuestionsService:  Claude 経由で「今月の経営者に聞くべき 5 問」生成
 *
 * 既存 health/ モジュール (k8s liveness 用) とは別物。
 */
@Module({
  imports: [forwardRef(() => AuthModule), HttpModule, PrismaModule, MfModule],
  controllers: [HealthSnapshotsController],
  providers: [HealthSnapshotsService, HealthQuestionsService],
  exports: [HealthSnapshotsService, HealthQuestionsService],
})
export class HealthSnapshotsModule {}
