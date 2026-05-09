import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { ChoshoController } from './chosho.controller';
import { ChoshoService } from './chosho.service';

/**
 * 残高調書 (Chosho) — 月次/決算レビュー用の月末残高一覧 + 異常検知 + コメント機能のモジュール。
 *
 * AuthModule は forwardRef 必須 (memory: NestJS 循環依存は末端まで forwardRef しないと
 * Cloud Run 起動時に "imports[0] is undefined" で失敗する)。
 */
@Module({
  imports: [forwardRef(() => AuthModule), PrismaModule, MfModule],
  controllers: [ChoshoController],
  providers: [ChoshoService],
  exports: [ChoshoService],
})
export class ChoshoModule {}
