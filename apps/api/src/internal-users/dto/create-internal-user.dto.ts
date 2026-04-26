import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

/**
 * SEVENRICH 事務所スタッフ作成 DTO。
 * - role は owner / advisor のみ。CL 側 (admin/member/viewer) は別 API
 *   (/organizations/:orgId/masters/users) で作成する
 * - 作成されるユーザーの orgId は NULL 固定（事務所スタッフはクロステナント）
 */
export class CreateInternalUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(['owner', 'advisor'])
  role!: 'owner' | 'advisor';
}
