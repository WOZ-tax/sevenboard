import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfModule } from '../mf/mf.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  JournalReviewController,
  JournalReviewSnapshotsController,
} from './journal-review.controller';
import { JournalReviewCommentsController } from './journal-review.comments.controller';
import { JournalReviewService } from './journal-review.service';

/**
 * 仕訳レビュー: Phase 2 / Unit 2-1 で「要確認」フラグ + 解決管理を追加。
 * Unit 2-2 で コメント (返信ツリー) を同 module に追加する想定。
 *
 * AuthModule は forwardRef 必須 (memory: NestJS 循環依存)。
 */
@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => MfModule), PrismaModule],
  controllers: [
    JournalReviewController,
    JournalReviewSnapshotsController,
    JournalReviewCommentsController,
  ],
  providers: [JournalReviewService],
  exports: [JournalReviewService],
})
export class JournalReviewModule {}
