import { IsString, IsEmail, MinLength, IsEnum, IsOptional } from 'class-validator';

/**
 * CL（顧問先）側ユーザーを作成するDTO。
 *
 * G-1 ロール設計：
 * - SEVENRICH = 事務所スタッフ (owner / advisor)
 * - CL = 閲覧専用 (viewer)
 *
 * このエンドポイント (POST /organizations/:orgId/masters/users) は
 * CL 内のユーザーを作成する用途。CL に owner / admin / advisor 権限を
 * 渡さないため、role は 'viewer' のみ許可する。
 *
 * 事務所スタッフ自身は `/tenants/:tenantId/staff` から招待する。
 */
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** CL ユーザーは viewer 固定。省略時も viewer */
  @IsEnum(['viewer'])
  @IsOptional()
  role?: 'viewer';
}
