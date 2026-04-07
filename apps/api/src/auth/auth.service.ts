import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }
    return user;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
      },
    };
  }

  async refresh(userId: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, orgId: true, avatarUrl: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async getUserOrganizations(userId: string, role: string) {
    if (role === 'ADVISOR') {
      const assignments = await this.prisma.advisorAssignment.findMany({
        where: { userId },
        include: {
          organization: {
            select: { id: true, name: true, code: true, industry: true, fiscalMonthEnd: true },
          },
        },
      });
      return assignments.map((a) => a.organization);
    }

    // 通常ユーザーは自分の組織のみ
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: { id: true, name: true, code: true, industry: true, fiscalMonthEnd: true },
        },
      },
    });
    return user?.organization ? [user.organization] : [];
  }

  async switchOrg(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // ADVISORはAdvisorAssignmentで権限チェック
    if (user.role === 'ADVISOR') {
      const assignment = await this.prisma.advisorAssignment.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });
      if (!assignment) {
        throw new UnauthorizedException('Not assigned to this organization');
      }
    } else if (user.orgId !== orgId) {
      throw new UnauthorizedException('Cannot switch to this organization');
    }

    // orgId付きのJWTを発行
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId,
      },
    };
  }
}
