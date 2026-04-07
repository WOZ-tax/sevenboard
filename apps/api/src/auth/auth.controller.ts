import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Response,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  JWT_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  jwtCookieOptions,
  csrfCookieOptions,
} from '../common/cookie.config';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setAuthCookies(res: ExpressResponse, accessToken: string) {
    // JWT httpOnly Cookie
    res.cookie(JWT_COOKIE_NAME, accessToken, jwtCookieOptions);
    // CSRF token (readable by frontend)
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(res, result.accessToken);
    return result;
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Request() req,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.refresh(req.user.id);
    this.setAuthCookies(res, result.accessToken);
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Response({ passthrough: true }) res: ExpressResponse) {
    res.clearCookie(JWT_COOKIE_NAME);
    res.clearCookie(CSRF_COOKIE_NAME);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @Get('me/organizations')
  @UseGuards(JwtAuthGuard)
  async myOrganizations(@Request() req) {
    return this.authService.getUserOrganizations(req.user.id, req.user.role);
  }

  @Post('switch-org')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async switchOrg(
    @Request() req,
    @Body() dto: SwitchOrgDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.switchOrg(req.user.id, dto.orgId);
    this.setAuthCookies(res, result.accessToken);
    return result;
  }
}
