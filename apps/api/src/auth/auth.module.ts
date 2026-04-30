import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MfOAuthController } from './mf-oauth.controller';
import { JwtStrategy } from './jwt.strategy';
import { OrgAccessService } from './org-access.service';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './permission.guard';
import { MfModule } from '../mf/mf.module';

@Module({
  imports: [
    PassportModule,
    HttpModule.register({ timeout: 30000 }),
    // MfModule → KintoneModule → AuthModule の循環参照を回避
    forwardRef(() => MfModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET || (() => {
        if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required');
        return 'sevenboard-dev-secret-do-not-use-in-production';
      })(),
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController, MfOAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    OrgAccessService,
    AuthorizationService,
    PermissionGuard,
  ],
  // OrgAccessService を他 module から DI できるように export
  exports: [AuthService, OrgAccessService, AuthorizationService, PermissionGuard],
})
export class AuthModule {}
