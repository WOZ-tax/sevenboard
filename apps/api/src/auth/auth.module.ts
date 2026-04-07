import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MfOAuthController } from './mf-oauth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    HttpModule.register({ timeout: 30000 }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || (() => {
        if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required');
        return 'sevenboard-dev-secret-do-not-use-in-production';
      })(),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController, MfOAuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
