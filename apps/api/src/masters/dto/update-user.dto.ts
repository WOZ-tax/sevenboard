import { IsString, IsOptional, IsEnum, MinLength } from 'class-validator';

/**
 * CL ユーザーの更新 DTO。
 * G-1: CL は viewer のみ許可。owner / admin / advisor へ昇格させる経路は閉じる。
 */
export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  /** CL ユーザーは viewer 固定。事務所スタッフ招待は /tenants/:tenantId/staff で行う */
  @IsEnum(['viewer'])
  @IsOptional()
  role?: 'viewer';

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
