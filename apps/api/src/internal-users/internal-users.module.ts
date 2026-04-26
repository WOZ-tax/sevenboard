import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';

@Module({
  imports: [PrismaModule],
  controllers: [InternalUsersController],
  providers: [InternalUsersService],
})
export class InternalUsersModule {}
