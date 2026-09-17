import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';
import { BulkStaffService } from './bulk-staff.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [InternalUsersController],
  providers: [InternalUsersService, BulkStaffService],
})
export class InternalUsersModule {}
