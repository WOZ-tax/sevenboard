import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DemoService } from './demo.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
