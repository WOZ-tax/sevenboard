import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateInternalUserDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  /** 昇格 / 降格は owner ↔ advisor のみ。CL ロールは禁止 */
  @IsEnum(['owner', 'advisor'])
  @IsOptional()
  role?: 'owner' | 'advisor';

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
