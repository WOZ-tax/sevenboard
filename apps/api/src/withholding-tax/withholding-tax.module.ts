import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfModule } from '../mf/mf.module';
import { WithholdingTaxController } from './withholding-tax.controller';
import { WithholdingTaxService } from './withholding-tax.service';

@Module({
  imports: [forwardRef(() => AuthModule), PrismaModule, MfModule],
  controllers: [WithholdingTaxController],
  providers: [WithholdingTaxService],
  exports: [WithholdingTaxService],
})
export class WithholdingTaxModule {}
